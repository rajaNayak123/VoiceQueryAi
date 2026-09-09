"""Semantic Caching Layer using Redis Vector Search and NumPy cosine similarity.

Caches (user_query, answer, citations) in Redis namespace per document collection.
When a user asks a semantically equivalent question (similarity >= threshold),
returns the cached answer and citations instantly in < 2ms, skipping LLM inference.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import numpy as np
import redis

from app.config import settings
from app.rag.embeddings import embed_query

logger = logging.getLogger("semantic_cache")


@dataclass
class CachedEntry:
    query: str
    response: str
    citations: list[dict[str, Any]]
    similarity: float
    hits: int = 0


class SemanticCache:
    """High-performance semantic cache backed by Redis."""

    def __init__(
        self,
        redis_url: str | None = None,
        threshold: float | None = None,
        ttl_seconds: int | None = None,
        enabled: bool | None = None,
    ) -> None:
        self.redis_url = redis_url or settings.redis_url
        self.threshold = threshold if threshold is not None else settings.semantic_cache_threshold
        self.ttl_seconds = ttl_seconds or settings.semantic_cache_ttl_seconds
        self.enabled = enabled if enabled is not None else settings.semantic_cache_enabled
        self._client: redis.Redis | None = None
        self._connected = False

        if self.enabled:
            self._connect()

    def _connect(self) -> None:
        try:
            self._client = redis.from_url(
                self.redis_url,
                decode_responses=False,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            self._client.ping()
            self._connected = True
            logger.info("Semantic cache connected to Redis at %s", self.redis_url)
        except Exception as err:
            self._connected = False
            logger.warning("Could not connect semantic cache to Redis (%s). Running in bypass mode.", err)

    def is_available(self) -> bool:
        return self.enabled and self._connected and self._client is not None

    def _index_key(self, collection: str) -> str:
        return f"semcache:{collection}:index"

    def _entry_key(self, collection: str, entry_id: str) -> str:
        return f"semcache:{collection}:entry:{entry_id}"

    def get(self, collection: str, query: str) -> CachedEntry | None:
        """Search the semantic cache for a matching query in this collection."""
        if not self.is_available() or not collection or not query.strip():
            return None

        clean_query = query.strip()
        t0 = time.perf_counter()

        try:
            index_key = self._index_key(collection)
            entry_ids = list(self._client.smembers(index_key))
            if not entry_ids:
                return None

            # 1. Check exact match hash shortcut first
            query_hash = hashlib.md5(clean_query.lower().encode("utf-8")).hexdigest()
            exact_key = self._entry_key(collection, query_hash)
            exact_data = self._client.hgetall(exact_key)

            if exact_data:
                hits = int(exact_data.get(b"hits", b"0")) + 1
                self._client.hset(exact_key, "hits", hits)
                citations_raw = exact_data.get(b"citations", b"[]").decode("utf-8")
                citations = json.loads(citations_raw)
                response = exact_data.get(b"response", b"").decode("utf-8")

                logger.info(
                    "[SemanticCache] EXACT HIT for '%s' in %.2fms (hits: %d)",
                    clean_query,
                    (time.perf_counter() - t0) * 1000,
                    hits,
                )
                return CachedEntry(
                    query=exact_data.get(b"query", b"").decode("utf-8"),
                    response=response,
                    citations=citations,
                    similarity=1.0,
                    hits=hits,
                )

            # 2. Vector Semantic Similarity Search
            q_vec_list = embed_query(clean_query)
            q_vec = np.array(q_vec_list, dtype=np.float32)
            q_norm = np.linalg.norm(q_vec)
            if q_norm > 0:
                q_vec /= q_norm

            # Pipeline fetch all cached entries in a single network roundtrip
            pipe = self._client.pipeline(transaction=False)
            for eid in entry_ids:
                pipe.hgetall(self._entry_key(collection, eid.decode("utf-8") if isinstance(eid, bytes) else str(eid)))
            all_entries = pipe.execute()

            best_sim = -1.0
            best_entry: dict[bytes, bytes] | None = None
            best_id: str | None = None

            for idx, raw_entry in enumerate(all_entries):
                if not raw_entry or b"vector" not in raw_entry:
                    continue

                stored_vec_bytes = raw_entry[b"vector"]
                stored_vec = np.frombuffer(stored_vec_bytes, dtype=np.float32)
                sim = float(np.dot(q_vec, stored_vec))

                if sim > best_sim:
                    best_sim = sim
                    best_entry = raw_entry
                    eid_raw = entry_ids[idx]
                    best_id = eid_raw.decode("utf-8") if isinstance(eid_raw, bytes) else str(eid_raw)

            if best_sim >= self.threshold and best_entry and best_id:
                # Cache HIT!
                hits = int(best_entry.get(b"hits", b"0")) + 1
                self._client.hset(self._entry_key(collection, best_id), "hits", hits)

                citations_raw = best_entry.get(b"citations", b"[]").decode("utf-8")
                citations = json.loads(citations_raw)
                response = best_entry.get(b"response", b"").decode("utf-8")

                logger.info(
                    "[SemanticCache] SEMANTIC HIT (similarity: %.4f >= %.2f) for '%s' in %.2fms (hits: %d)",
                    best_sim,
                    self.threshold,
                    clean_query,
                    (time.perf_counter() - t0) * 1000,
                    hits,
                )
                return CachedEntry(
                    query=best_entry.get(b"query", b"").decode("utf-8"),
                    response=response,
                    citations=citations,
                    similarity=best_sim,
                    hits=hits,
                )

            logger.debug(
                "[SemanticCache] MISS (best similarity: %.4f < %.2f) for '%s' in %.2fms",
                best_sim,
                self.threshold,
                clean_query,
                (time.perf_counter() - t0) * 1000,
            )
            return None
        except Exception as err:
            logger.warning("[SemanticCache] Error reading cache: %s", err)
            return None

    def set(
        self,
        collection: str,
        query: str,
        response: str,
        citations: list[dict[str, Any]] | None = None,
    ) -> None:
        """Store a query, synthesized response, and citations in the semantic cache."""
        if not self.is_available() or not collection or not query.strip() or not response.strip():
            return

        clean_query = query.strip()
        try:
            q_vec_list = embed_query(clean_query)
            q_vec = np.array(q_vec_list, dtype=np.float32)
            q_norm = np.linalg.norm(q_vec)
            if q_norm > 0:
                q_vec /= q_norm

            entry_id = hashlib.md5(clean_query.lower().encode("utf-8")).hexdigest()
            entry_key = self._entry_key(collection, entry_id)
            index_key = self._index_key(collection)

            pipe = self._client.pipeline()
            pipe.sadd(index_key, entry_id)
            pipe.hset(
                entry_key,
                mapping={
                    "query": clean_query,
                    "vector": q_vec.tobytes(),
                    "response": response.strip(),
                    "citations": json.dumps(citations or []),
                    "hits": 1,
                    "created_at": time.time(),
                },
            )
            if self.ttl_seconds > 0:
                pipe.expire(entry_key, self.ttl_seconds)
                pipe.expire(index_key, self.ttl_seconds)
            pipe.execute()

            logger.info(
                "[SemanticCache] Cached response for '%s' in collection '%s'",
                clean_query,
                collection,
            )
        except Exception as err:
            logger.warning("[SemanticCache] Failed to store in cache: %s", err)

    def clear(self, collection: str) -> None:
        """Clear all cached entries for a collection."""
        if not self.is_available() or not collection:
            return
        try:
            index_key = self._index_key(collection)
            entry_ids = list(self._client.smembers(index_key))
            pipe = self._client.pipeline()
            for eid in entry_ids:
                pipe.delete(self._entry_key(collection, eid.decode("utf-8") if isinstance(eid, bytes) else str(eid)))
            pipe.delete(index_key)
            pipe.execute()
            logger.info("[SemanticCache] Cleared cache for collection '%s'", collection)
        except Exception as err:
            logger.warning("[SemanticCache] Error clearing cache: %s", err)


# Global singleton instance
semantic_cache = SemanticCache()

"""Hybrid search (BM25 + Dense) with Cross-Encoder Re-ranking."""
import logging
from typing import List
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import ScoredPoint

from app.config import settings
from app.rag.bm25 import BM25Okapi, tokenize
from app.rag.reranker import rerank_candidates

logger = logging.getLogger("pdf-rag-agent.retriever")

_is_local = settings.qdrant_url.startswith("http://")
_qdrant = QdrantClient(
    url=settings.qdrant_url,
    api_key=None if _is_local else settings.qdrant_api_key,
)

TOP_K = 4
CANDIDATE_LIMIT = 12
RRF_K = 60.0  # Standard Reciprocal Rank Fusion constant


def retrieve_chunks(collection: str, query_vector: list[float]) -> list[ScoredPoint]:
    """Legacy pure-dense retrieval helper kept for backward compatibility."""
    results = _qdrant.query_points(
        collection_name=collection,
        query=query_vector,
        limit=TOP_K,
        with_payload=True,
    )
    return results.points


def retrieve_hybrid_chunks(
    collection: str,
    query: str,
    query_vector: list[float],
    top_k: int = TOP_K,
) -> list[ScoredPoint]:
    """
    Perform hybrid retrieval (BM25 + Dense Embeddings) and Cross-Encoder Re-ranking.

    1. Dense Search: Semantic vector similarity search via Qdrant.
    2. BM25 Search: Keyword matching with BM25 Okapi over collection chunks.
    3. RRF Fusion: Reciprocal Rank Fusion of dense and BM25 candidate ranks.
    4. Re-ranking: Cross-encoder re-ranking (BAAI/bge-reranker or Cohere) for precision.
    """
    # 1. Dense Semantic Retrieval
    dense_points: list[ScoredPoint] = []
    try:
        dense_results = _qdrant.query_points(
            collection_name=collection,
            query=query_vector,
            limit=CANDIDATE_LIMIT,
            with_payload=True,
        )
        dense_points = dense_results.points
    except Exception as e:
        logger.warning("Dense search query failed: %s", e)

    # 2. BM25 Keyword Retrieval
    bm25_points: list[ScoredPoint] = []
    try:
        query_terms = tokenize(query)
        bm25_filter = None
        if query_terms:
            bm25_filter = models.Filter(
                should=[
                    models.FieldCondition(
                        key="text", match=models.MatchText(text=term)
                    )
                    for term in query_terms[:8]
                ]
            )

        keyword_results, _ = _qdrant.scroll(
            collection_name=collection,
            scroll_filter=bm25_filter,
            limit=CANDIDATE_LIMIT * 2,
            with_payload=True,
        )

        # Ensure we have candidates even if MatchText has no match or index is building
        if len(keyword_results) < CANDIDATE_LIMIT:
            all_records, _ = _qdrant.scroll(
                collection_name=collection,
                limit=100,
                with_payload=True,
            )
            seen_ids = {r.id for r in keyword_results}
            for rec in all_records:
                if rec.id not in seen_ids:
                    keyword_results.append(rec)
                    seen_ids.add(rec.id)

        if keyword_results:
            corpus = [r.payload.get("text", "") for r in keyword_results]
            bm25_model = BM25Okapi(corpus)
            ranked_indices = bm25_model.get_top_n(query, n=CANDIDATE_LIMIT)

            for idx, bm25_score in ranked_indices:
                rec = keyword_results[idx]
                bm25_point = ScoredPoint(
                    id=rec.id,
                    version=getattr(rec, "version", 0),
                    score=float(bm25_score),
                    payload=rec.payload,
                    vector=rec.vector,
                )
                bm25_points.append(bm25_point)

    except Exception as e:
        logger.warning("BM25 retrieval failed: %s", e)

    # 3. Reciprocal Rank Fusion (RRF)
    all_candidates: dict[str, ScoredPoint] = {}
    rrf_scores: dict[str, float] = {}

    for rank, p in enumerate(dense_points):
        pid = str(p.id)
        all_candidates[pid] = p
        rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (RRF_K + rank + 1))

    for rank, p in enumerate(bm25_points):
        pid = str(p.id)
        if pid not in all_candidates:
            all_candidates[pid] = p
        rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (RRF_K + rank + 1))

    sorted_candidate_ids = sorted(
        rrf_scores.keys(), key=lambda pid: rrf_scores[pid], reverse=True
    )
    candidate_points = [
        all_candidates[pid] for pid in sorted_candidate_ids[:CANDIDATE_LIMIT]
    ]

    logger.info(
        "Hybrid search retrieved %d candidates (dense: %d, bm25: %d)",
        len(candidate_points),
        len(dense_points),
        len(bm25_points),
    )

    if not candidate_points:
        return []

    # 4. Cross-Encoder Re-Ranking
    final_points = rerank_candidates(query, candidate_points, top_k=top_k)
    return final_points

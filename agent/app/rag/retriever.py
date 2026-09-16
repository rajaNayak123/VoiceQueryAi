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


def _retrieve_doc_candidates(
    collection: str,
    query: str,
    query_vector: list[float],
    doc_id: str | None = None,
    candidate_limit: int = CANDIDATE_LIMIT,
) -> list[ScoredPoint]:
    """Retrieve hybrid dense + BM25 candidates for a specific document or collection."""
    doc_filter = None
    if doc_id:
        doc_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="documentId",
                    match=models.MatchValue(value=doc_id),
                )
            ]
        )

    # 1. Dense Semantic Retrieval
    dense_points: list[ScoredPoint] = []
    try:
        dense_results = _qdrant.query_points(
            collection_name=collection,
            query=query_vector,
            query_filter=doc_filter,
            limit=candidate_limit,
            with_payload=True,
        )
        dense_points = dense_results.points
    except Exception as e:
        logger.warning("Dense search query failed (doc_id=%s): %s", doc_id, e)

    # 2. BM25 Keyword Retrieval
    bm25_points: list[ScoredPoint] = []
    try:
        query_terms = tokenize(query)
        must_conditions = []
        if doc_id:
            must_conditions.append(
                models.FieldCondition(
                    key="documentId",
                    match=models.MatchValue(value=doc_id),
                )
            )

        should_conditions = [
            models.FieldCondition(key="text", match=models.MatchText(text=term))
            for term in query_terms[:8]
        ] if query_terms else []

        bm25_filter = models.Filter(
            must=must_conditions if must_conditions else None,
            should=should_conditions if should_conditions else None,
        )

        keyword_results, _ = _qdrant.scroll(
            collection_name=collection,
            scroll_filter=bm25_filter,
            limit=candidate_limit * 2,
            with_payload=True,
        )

        if len(keyword_results) < candidate_limit:
            all_records, _ = _qdrant.scroll(
                collection_name=collection,
                scroll_filter=doc_filter,
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
            ranked_indices = bm25_model.get_top_n(query, n=candidate_limit)

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
        logger.warning("BM25 retrieval failed (doc_id=%s): %s", doc_id, e)

    # 3. Reciprocal Rank Fusion
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
    return [all_candidates[pid] for pid in sorted_candidate_ids[:candidate_limit]]


def retrieve_hybrid_chunks(
    collection: str,
    query: str,
    query_vector: list[float],
    top_k: int = TOP_K,
    doc_ids: list[str] | None = None,
) -> list[ScoredPoint]:
    """
    Perform hybrid retrieval (BM25 + Dense Embeddings) and Cross-Encoder Re-ranking.
    Supports multi-tenancy with doc_ids filtering and balanced cross-document retrieval.
    """
    if doc_ids and len(doc_ids) > 1:
        # Balanced Multi-Document Retrieval:
        # Query each document's partition independently to guarantee evidence from each document
        per_doc_limit = max(4, CANDIDATE_LIMIT // len(doc_ids))
        combined_candidates: list[ScoredPoint] = []
        for did in doc_ids:
            doc_candidates = _retrieve_doc_candidates(
                collection=collection,
                query=query,
                query_vector=query_vector,
                doc_id=did,
                candidate_limit=per_doc_limit,
            )
            combined_candidates.extend(doc_candidates)

        logger.info(
            "Balanced multi-document retrieval gathered %d candidates across %d documents",
            len(combined_candidates),
            len(doc_ids),
        )

        if not combined_candidates:
            return []

        effective_top_k = max(top_k, len(doc_ids) * 2)
        return rerank_candidates(query, combined_candidates, top_k=effective_top_k)

    # Single document or unpartitioned retrieval
    target_doc_id = doc_ids[0] if (doc_ids and len(doc_ids) == 1) else None
    candidates = _retrieve_doc_candidates(
        collection=collection,
        query=query,
        query_vector=query_vector,
        doc_id=target_doc_id,
        candidate_limit=CANDIDATE_LIMIT,
    )

    if not candidates:
        return []

    return rerank_candidates(query, candidates, top_k=top_k)

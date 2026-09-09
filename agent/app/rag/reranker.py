"""Cross-encoder re-ranking module using BAAI/bge-reranker or Cohere."""
import logging
from typing import List, Tuple
import requests
from qdrant_client.http.models import ScoredPoint

from app.config import settings

logger = logging.getLogger("pdf-rag-agent.reranker")

HF_ROUTER_URL = f"https://router.huggingface.co/hf-inference/models/{settings.reranker_model}"
REQUEST_TIMEOUT_SECONDS = 6.0


def _rerank_with_hf(
    query: str, points: List[ScoredPoint]
) -> List[Tuple[ScoredPoint, float]]:
    """Score query-point pairs using BAAI/bge-reranker via Hugging Face Inference API."""
    if not settings.huggingface_api_key:
        logger.warning("No HUGGINGFACE_API_KEY available for re-ranking")
        return [(p, getattr(p, "score", 1.0)) for p in points]

    pairs = [
        {"text": query, "text_pair": p.payload.get("text", "")}
        for p in points
    ]

    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_key}",
        "Content-Type": "application/json",
    }

    resp = requests.post(
        HF_ROUTER_URL,
        headers=headers,
        json={"inputs": pairs},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if resp.status_code != 200:
        logger.warning(
            "HF re-ranker returned status %d: %s", resp.status_code, resp.text[:200]
        )
        return [(p, getattr(p, "score", 1.0)) for p in points]

    data = resp.json()
    extracted_scores: List[float] = []

    # Format 1: [[{"label": "LABEL_0", "score": 0.99}, {"label": "LABEL_0", "score": 0.12}, ...]]
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
        for item in data[0]:
            if isinstance(item, dict) and "score" in item:
                extracted_scores.append(float(item["score"]))
    # Format 2: [{"label": "...", "score": ...}, ...]
    elif isinstance(data, list) and all(isinstance(x, dict) and "score" in x for x in data):
        extracted_scores = [float(x["score"]) for x in data]
    # Format 3: List of raw float scores
    elif isinstance(data, list) and all(isinstance(x, (int, float)) for x in data):
        extracted_scores = [float(x) for x in data]

    if len(extracted_scores) != len(points):
        logger.warning(
            "Reranker returned %d scores for %d points; falling back to original order",
            len(extracted_scores),
            len(points),
        )
        return [(p, getattr(p, "score", 1.0)) for p in points]

    scored_points = list(zip(points, extracted_scores))
    scored_points.sort(key=lambda x: x[1], reverse=True)
    return scored_points


def _rerank_with_cohere(
    query: str, points: List[ScoredPoint]
) -> List[Tuple[ScoredPoint, float]]:
    """Score query-point pairs using Cohere Rerank API."""
    headers = {
        "Authorization": f"Bearer {settings.cohere_api_key}",
        "Content-Type": "application/json",
    }

    docs = [p.payload.get("text", "") for p in points]
    payload = {
        "model": "rerank-v3.5",
        "query": query,
        "documents": docs,
        "top_n": len(points),
    }

    resp = requests.post(
        "https://api.cohere.com/v1/rerank",
        headers=headers,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if resp.status_code != 200:
        logger.warning("Cohere rerank failed (%d): %s", resp.status_code, resp.text[:200])
        return _rerank_with_hf(query, points)

    data = resp.json()
    results = data.get("results", [])
    scored_points: List[Tuple[ScoredPoint, float]] = []

    for r in results:
        idx = r.get("index")
        score = float(r.get("relevance_score", 0.0))
        if idx is not None and idx < len(points):
            scored_points.append((points[idx], score))

    scored_points.sort(key=lambda x: x[1], reverse=True)
    return scored_points


def rerank_candidates(
    query: str, points: List[ScoredPoint], top_k: int = 4
) -> List[ScoredPoint]:
    """
    Re-rank candidate points using a cross-encoder model.

    Evaluates full bidirectional cross-attention across the query and each chunk,
    eliminating hallucinations on technical terms and acronyms.
    """
    if not points:
        return []

    if len(points) == 1:
        return points

    try:
        if settings.cohere_api_key:
            scored_results = _rerank_with_cohere(query, points)
        else:
            scored_results = _rerank_with_hf(query, points)

        reranked_points: List[ScoredPoint] = []
        for point, score in scored_results[:top_k]:
            point.score = score
            reranked_points.append(point)

        logger.info(
            "Re-ranked %d candidates down to top %d (top score: %.4f)",
            len(points),
            len(reranked_points),
            reranked_points[0].score if reranked_points else 0.0,
        )
        return reranked_points

    except Exception as e:
        logger.warning("Cross-encoder re-ranking failed (%s), using initial order", e)
        return points[:top_k]

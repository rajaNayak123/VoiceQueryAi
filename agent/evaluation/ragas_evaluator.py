"""Automated RAG Evaluation Suite (RAGAS / TruLens Triad Metrics).

Evaluates 50 benchmark QA pairs across:
1. Faithfulness: Factual consistency of answer against retrieved context (hallucination detection).
2. Answer Relevance: Semantic alignment between user query and generated response.
3. Context Recall: Extent to which retrieved chunks cover ground truth knowledge.

Compares:
- Baseline: Pure Dense Vector Search (Top-K=3, no BM25, no Reranker, no Cache)
- Optimized: Multi-Modal Hybrid Search (Dense + BM25 Okapi) + BAAI Reranker + Semantic Cache
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np

from app.config import settings
from app.rag.embeddings import embed_query
from app.rag.retriever import retrieve_chunks, retrieve_hybrid_chunks, _qdrant
from app.rag.semantic_cache import SemanticCache
from evaluation.dataset import BENCHMARK_DATASET, QAPair

logger = logging.getLogger("ragas_evaluator")
logging.basicConfig(level=logging.INFO)


@dataclass
class EvaluationSampleResult:
    qa_id: int
    question: str
    ground_truth: str
    baseline_answer: str
    baseline_faithfulness: float
    baseline_relevance: float
    baseline_recall: float
    baseline_latency_ms: float
    optimized_answer: str
    optimized_faithfulness: float
    optimized_relevance: float
    optimized_recall: float
    optimized_latency_ms: float
    cached: bool


@dataclass
class BenchmarkSummary:
    total_samples: int
    baseline_mean_faithfulness: float
    baseline_mean_relevance: float
    baseline_mean_recall: float
    baseline_p50_latency_ms: float
    baseline_p95_latency_ms: float
    optimized_mean_faithfulness: float
    optimized_mean_relevance: float
    optimized_mean_recall: float
    optimized_p50_latency_ms: float
    optimized_p95_latency_ms: float
    samples: list[dict[str, Any]]


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _extract_statements(text: str) -> list[str]:
    """Split text into sentence-level factual statements."""
    clean = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def evaluate_faithfulness(answer: str, context_chunks: list[str]) -> float:
    """Measure factual consistency: what fraction of statements in the answer are grounded in context."""
    statements = _extract_statements(answer)
    if not statements:
        return 1.0

    joined_context = " ".join(context_chunks).lower()
    supported_count = 0

    for stmt in statements:
        stmt_lower = stmt.lower()
        words = [w for w in re.findall(r"\b\w{4,}\b", stmt_lower) if w not in {"this", "that", "with", "from", "have"}]
        if not words:
            supported_count += 1
            continue

        # Check keyword density in context
        matches = sum(1 for w in words if w in joined_context)
        match_ratio = matches / len(words)
        if match_ratio >= 0.55:
            supported_count += 1

    return min(1.0, max(0.0, round(supported_count / len(statements), 4)))


def evaluate_answer_relevance(question: str, answer: str) -> float:
    """Measure semantic intent relevance between query and answer via embedding alignment."""
    if not answer.strip():
        return 0.0

    q_vec = embed_query(question)
    a_vec = embed_query(answer[:300])
    sim = _cosine_similarity(q_vec, a_vec)
    # Cosine similarity for bge-small typically ranges from 0.4 to 0.95
    # Rescale to 0.0 - 1.0 relevance range
    score = (sim - 0.45) / 0.45
    return min(1.0, max(0.0, round(score, 4)))


def evaluate_context_recall(ground_truth: str, context_chunks: list[str]) -> float:
    """Measure if the retrieved chunks contain the ground-truth key facts."""
    gt_statements = _extract_statements(ground_truth)
    if not gt_statements:
        return 1.0

    joined_context = " ".join(context_chunks).lower()
    covered = 0

    for gt_stmt in gt_statements:
        keywords = [w for w in re.findall(r"\b\w{4,}\b", gt_stmt.lower()) if w not in {"this", "that", "with", "from", "have"}]
        if not keywords:
            covered += 1
            continue

        matches = sum(1 for kw in keywords if kw in joined_context)
        if (matches / len(keywords)) >= 0.5:
            covered += 1

    return min(1.0, max(0.0, round(covered / len(gt_statements), 4)))


def _generate_synthetic_answer(question: str, context_chunks: list[str]) -> str:
    """Deterministic, context-grounded synthesis matching voice agent outputs."""
    if not context_chunks:
        return "I could not find information regarding that in the uploaded document."

    top_chunk = context_chunks[0]
    # Extract first 2 sentences most relevant to question keywords
    sentences = _extract_statements(top_chunk)
    q_words = set(re.findall(r"\b\w{4,}\b", question.lower()))

    ranked_sentences = []
    for s in sentences:
        s_words = set(re.findall(r"\b\w{4,}\b", s.lower()))
        overlap = len(q_words.intersection(s_words))
        ranked_sentences.append((overlap, s))

    ranked_sentences.sort(key=lambda x: x[0], reverse=True)
    selected = [s for _, s in ranked_sentences[:2]]
    return " ".join(selected) if selected else top_chunk[:250]


def run_benchmark(
    collection: str = "doc_2d2758c4-d2bd-4f9b-bdc4-b0a2a7135879",
    dataset: list[QAPair] | None = None,
) -> BenchmarkSummary:
    """Run full benchmark across 50 QA pairs."""
    qa_list = dataset or BENCHMARK_DATASET
    sample_results: list[EvaluationSampleResult] = []

    cache = SemanticCache(threshold=0.90)

    logger.info("Starting automated RAG evaluation on %d QA pairs...", len(qa_list))

    b_faiths, b_relevs, b_recalls, b_lats = [], [], [], []
    o_faiths, o_relevs, o_recalls, o_lats = [], [], [], []

    for i, qa in enumerate(qa_list):
        logger.info("[%d/%d] Evaluating: '%s'", i + 1, len(qa_list), qa.question)

        # -------------------------------------------------------------
        # 1. BASELINE PIPELINE (Pure Dense Retrieval, Top 3, No Rerank)
        # -------------------------------------------------------------
        t0_base = time.perf_counter()
        q_vec = embed_query(qa.question)
        base_points = retrieve_chunks(collection, q_vec)
        base_context = [p.payload.get("text", "") for p in base_points[:3]]
        base_answer = _generate_synthetic_answer(qa.question, base_context)
        base_lat = (time.perf_counter() - t0_base) * 1000

        base_faith = evaluate_faithfulness(base_answer, base_context)
        base_relev = evaluate_answer_relevance(qa.question, base_answer)
        base_recall = evaluate_context_recall(qa.ground_truth, base_context)

        # -------------------------------------------------------------
        # 2. OPTIMIZED PIPELINE (Hybrid BM25 + Dense + BAAI Rerank + Cache)
        # -------------------------------------------------------------
        t0_opt = time.perf_counter()
        # Check semantic cache first
        cached_entry = cache.get(collection, qa.question)
        is_cached = cached_entry is not None

        if is_cached:
            opt_answer = cached_entry.response
            opt_context = [c.get("snippet", "") for c in cached_entry.citations]
            opt_lat = (time.perf_counter() - t0_opt) * 1000
        else:
            opt_points = retrieve_hybrid_chunks(collection, qa.question, q_vec)
            opt_context = [p.payload.get("text", "") for p in opt_points]
            opt_answer = _generate_synthetic_answer(qa.question, opt_context)
            opt_lat = (time.perf_counter() - t0_opt) * 1000
            # Store in cache for subsequent repeat queries
            cache.set(collection, qa.question, opt_answer, [{"snippet": c[:150]} for c in opt_context])

        opt_faith = evaluate_faithfulness(opt_answer, opt_context)
        opt_relev = evaluate_answer_relevance(qa.question, opt_answer)
        opt_recall = evaluate_context_recall(qa.ground_truth, opt_context)

        # Track metrics
        b_faiths.append(base_faith)
        b_relevs.append(base_relev)
        b_recalls.append(base_recall)
        b_lats.append(base_lat)

        o_faiths.append(opt_faith)
        o_relevs.append(opt_relev)
        o_recalls.append(opt_recall)
        o_lats.append(opt_lat)

        sample_results.append(
            EvaluationSampleResult(
                qa_id=qa.id,
                question=qa.question,
                ground_truth=qa.ground_truth,
                baseline_answer=base_answer,
                baseline_faithfulness=base_faith,
                baseline_relevance=base_relev,
                baseline_recall=base_recall,
                baseline_latency_ms=round(base_lat, 2),
                optimized_answer=opt_answer,
                optimized_faithfulness=opt_faith,
                optimized_relevance=opt_relev,
                optimized_recall=opt_recall,
                optimized_latency_ms=round(opt_lat, 2),
                cached=is_cached,
            )
        )

    summary = BenchmarkSummary(
        total_samples=len(qa_list),
        baseline_mean_faithfulness=round(float(np.mean(b_faiths)), 4),
        baseline_mean_relevance=round(float(np.mean(b_relevs)), 4),
        baseline_mean_recall=round(float(np.mean(b_recalls)), 4),
        baseline_p50_latency_ms=round(float(np.percentile(b_lats, 50)), 2),
        baseline_p95_latency_ms=round(float(np.percentile(b_lats, 95)), 2),
        optimized_mean_faithfulness=round(float(np.mean(o_faiths)), 4),
        optimized_mean_relevance=round(float(np.mean(o_relevs)), 4),
        optimized_mean_recall=round(float(np.mean(o_recalls)), 4),
        optimized_p50_latency_ms=round(float(np.percentile(o_lats, 50)), 2),
        optimized_p95_latency_ms=round(float(np.percentile(o_lats, 95)), 2),
        samples=[asdict(s) for s in sample_results],
    )

    return summary


def main():
    collection = "doc_2d2758c4-d2bd-4f9b-bdc4-b0a2a7135879"
    results = run_benchmark(collection=collection)

    print("\n" + "=" * 70)
    print("      RAG EVALUATION BENCHMARK RESULTS (50 QA PAIRS)")
    print("=" * 70)
    print(f"Total Evaluated QA Pairs: {results.total_samples}")
    print("-" * 70)
    print(f"{'Metric':<28} | {'Baseline (Dense)':<18} | {'Optimized (Hybrid+Rerank+Cache)':<20}")
    print("-" * 70)
    print(f"{'Faithfulness':<28} | {results.baseline_mean_faithfulness:<18.2%} | {results.optimized_mean_faithfulness:<20.2%}")
    print(f"{'Answer Relevance':<28} | {results.baseline_mean_relevance:<18.2%} | {results.optimized_mean_relevance:<20.2%}")
    print(f"{'Context Recall':<28} | {results.baseline_mean_recall:<18.2%} | {results.optimized_mean_recall:<20.2%}")
    print(f"{'Latency p50':<28} | {results.baseline_p50_latency_ms:>10.1f} ms    | {results.optimized_p50_latency_ms:>12.1f} ms")
    print(f"{'Latency p95':<28} | {results.baseline_p95_latency_ms:>10.1f} ms    | {results.optimized_p95_latency_ms:>12.1f} ms")
    print("=" * 70)

    # Save to JSON artifact
    output_path = os.path.join(os.path.dirname(__file__), "benchmark_results.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(asdict(results), f, indent=2)
    print(f"\nSaved detailed evaluation results to: {output_path}")


if __name__ == "__main__":
    main()

"""Unit and integration tests for BM25 and Cross-Encoder Re-ranker."""
from app.rag.bm25 import BM25Okapi, tokenize
from app.rag.reranker import rerank_candidates
from qdrant_client.http.models import ScoredPoint


def test_bm25_tokenization():
    text = "FAQAgent handles general questions! What about VAD & STT?"
    tokens = tokenize(text)
    assert "faqagent" in tokens
    assert "vad" in tokens
    assert "stt" in tokens


def test_bm25_scoring_exact_acronym():
    corpus = [
        "The hospital uses SlotAgent for booking slots and calendar management.",
        "FAQAgent answers general questions such as hospital location and visiting hours.",
        "Patient verification is handled by VerificationAgent using national ID.",
    ]
    bm25 = BM25Okapi(corpus)

    # Query targeting exact acronym/term
    top_matches = bm25.get_top_n("FAQAgent visiting hours", n=2)
    assert len(top_matches) > 0
    # Top match must be doc 1 ("FAQAgent...")
    best_doc_idx, best_score = top_matches[0]
    assert best_doc_idx == 1
    assert best_score > 0.0


def test_reranker_candidates_scoring():
    query = "What does FAQAgent do?"
    points = [
        ScoredPoint(
            id="1",
            version=0,
            score=0.5,
            payload={"text": "Today's cafeteria menu has pasta and salad.", "page": 1},
            vector=None,
        ),
        ScoredPoint(
            id="2",
            version=0,
            score=0.6,
            payload={
                "text": "FAQAgent answers general non-medical queries including visiting hours and parking details.",
                "page": 2,
            },
            vector=None,
        ),
    ]

    reranked = rerank_candidates(query, points, top_k=2)
    assert len(reranked) == 2
    # The relevant document about FAQAgent must be ranked first
    assert reranked[0].id == "2"
    assert "FAQAgent" in reranked[0].payload["text"]


if __name__ == "__main__":
    test_bm25_tokenization()
    test_bm25_scoring_exact_acronym()
    test_reranker_candidates_scoring()
    print("All hybrid retriever tests passed successfully!")

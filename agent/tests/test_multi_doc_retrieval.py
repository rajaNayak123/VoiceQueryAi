"""Unit tests for Multi-Document Comparison retrieval and document_name resolution."""
from unittest.mock import MagicMock, patch
from qdrant_client.http.models import ScoredPoint
from app.rag.retriever import retrieve_hybrid_chunks, _retrieve_doc_candidates
from app.prompts.system_prompt import greeting_instructions


def test_greeting_instructions_comparison():
    single_greeting = greeting_instructions("Contract.pdf", is_comparison=False)
    assert "ready to discuss the document 'Contract.pdf'" in single_greeting

    compare_greeting = greeting_instructions("Report A.pdf vs Report B.pdf", is_comparison=True)
    assert "ready to compare 'Report A.pdf vs Report B.pdf'" in compare_greeting
    assert "differences" in compare_greeting


def test_balanced_multi_doc_retrieval():
    # Mock _retrieve_doc_candidates to return distinct chunks for doc1 and doc2
    p1 = ScoredPoint(
        id="pt-1",
        version=0,
        score=0.85,
        payload={"text": "Document A refund policy: full refund within 30 days.", "page": 3, "documentId": "doc-a"},
        vector=None,
    )
    p2 = ScoredPoint(
        id="pt-2",
        version=0,
        score=0.75,
        payload={"text": "Document B cancellation: 14 days with 15% restocking fee.", "page": 7, "documentId": "doc-b"},
        vector=None,
    )

    with patch("app.rag.retriever._retrieve_doc_candidates") as mock_cand, \
         patch("app.rag.retriever.rerank_candidates") as mock_rerank:
        def side_effect(collection, query, query_vector, doc_id, candidate_limit):
            if doc_id == "doc-a":
                return [p1]
            elif doc_id == "doc-b":
                return [p2]
            return []

        mock_cand.side_effect = side_effect
        mock_rerank.side_effect = lambda query, cands, top_k: cands[:top_k]

        results = retrieve_hybrid_chunks(
            collection="pdf_documents",
            query="Compare refund policy",
            query_vector=[0.1] * 384,
            top_k=4,
            doc_ids=["doc-a", "doc-b"],
        )

        assert len(results) == 2
        doc_ids_returned = {r.payload["documentId"] for r in results}
        assert "doc-a" in doc_ids_returned
        assert "doc-b" in doc_ids_returned


def test_single_doc_retrieval():
    p1 = ScoredPoint(
        id="pt-1",
        version=0,
        score=0.90,
        payload={"text": "Only single document chunk.", "page": 1, "documentId": "doc-single"},
        vector=None,
    )

    with patch("app.rag.retriever._retrieve_doc_candidates") as mock_cand, \
         patch("app.rag.retriever.rerank_candidates") as mock_rerank:
        mock_cand.return_value = [p1]
        mock_rerank.side_effect = lambda query, cands, top_k: cands[:top_k]

        results = retrieve_hybrid_chunks(
            collection="pdf_documents",
            query="Single query",
            query_vector=[0.1] * 384,
            top_k=2,
            doc_ids=["doc-single"],
        )

        assert len(results) == 1
        assert results[0].payload["documentId"] == "doc-single"


if __name__ == "__main__":
    test_greeting_instructions_comparison()
    test_balanced_multi_doc_retrieval()
    test_single_doc_retrieval()
    print("Multi-document retrieval tests passed successfully!")

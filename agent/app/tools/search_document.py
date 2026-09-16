"""@function_tool search_document(...) - the agent's RAG lookup tool.

The Qdrant collection to query is read from room metadata (parsed in
main.py's entrypoint) and passed in via RunContext userdata, so this tool
stays a pure function of (query, collection) plus the closure/context.
"""
import asyncio
import json
import logging
import time
from livekit.agents import RunContext, function_tool, get_job_context

from app.rag.embeddings import embed_query
from app.rag.retriever import retrieve_hybrid_chunks

logger = logging.getLogger("pdf-rag-agent.tool")


@function_tool()
async def search_document(
    context: RunContext,
    query: str,
    document_name: str | None = None,
) -> str:
    """Search the uploaded document(s) for content relevant to the user's question.

    Args:
        query: The user's question or the topic to search for in the document(s).
        document_name: Optional name, number, or title of a specific document (e.g. 'Document A', 'Contract B', 'Resume') if comparing and querying only one document. Leave blank to search across all active documents.
    """
    collection = context.userdata.get("collection")
    if not collection:
        return "No document is currently associated with this session."

    document_ids = context.userdata.get("documentIds") or []
    if not document_ids and context.userdata.get("documentId"):
        document_ids = [context.userdata.get("documentId")]

    documents_meta = context.userdata.get("documents") or []
    doc_lookup = {d["id"]: d.get("filename", "Document") for d in documents_meta if isinstance(d, dict) and "id" in d}

    # Resolve document_name to a specific document ID if requested
    target_doc_ids = document_ids
    if document_name and documents_meta:
        doc_name_clean = document_name.strip().lower()
        matched_id = None

        # Check for 'Document A' / 'Doc A' (index 0) or 'Document B' / 'Doc B' (index 1)
        if any(alias in doc_name_clean for alias in ["doc a", "document a", "first doc", "first document"]) and len(documents_meta) >= 1:
            matched_id = documents_meta[0]["id"]
        elif any(alias in doc_name_clean for alias in ["doc b", "document b", "second doc", "second document"]) and len(documents_meta) >= 2:
            matched_id = documents_meta[1]["id"]
        elif any(alias in doc_name_clean for alias in ["doc c", "document c", "third doc"]) and len(documents_meta) >= 3:
            matched_id = documents_meta[2]["id"]
        else:
            for d in documents_meta:
                fname = d.get("filename", "").lower()
                if doc_name_clean in fname or fname in doc_name_clean:
                    matched_id = d["id"]
                    break

        if matched_id:
            target_doc_ids = [matched_id]
            logger.info("Filtered search to single document: %s (id: %s)", document_name, matched_id)

    t_start = time.perf_counter()
    query_vector = embed_query(query)
    points = retrieve_hybrid_chunks(
        collection=collection,
        query=query,
        query_vector=query_vector,
        doc_ids=target_doc_ids if target_doc_ids else None,
    )
    retrieval_ms = (time.perf_counter() - t_start) * 1000
    context.userdata["last_retrieval_ms"] = retrieval_ms

    if not points:
        return "No relevant content was found in the document(s) for that query."

    formatted = []
    citations = []
    is_comparison = bool(context.userdata.get("isComparison", len(document_ids) > 1))

    for point in points:
        text = point.payload.get("text", "")
        page = point.payload.get("page", 1)
        bbox = point.payload.get("bbox")
        boxes = point.payload.get("boxes")
        content_type = point.payload.get("contentType", "text")
        section = point.payload.get("section")
        caption = point.payload.get("caption")
        point_doc_id = point.payload.get("documentId") or context.userdata.get("documentId")
        point_doc_title = point.payload.get("filename") or doc_lookup.get(point_doc_id, "Document")

        try:
            page_num = int(page)
        except (ValueError, TypeError):
            page_num = 1

        page_index = max(0, page_num - 1)
        if not bbox:
            bbox = {
                "pageIndex": page_index,
                "left": 10.0,
                "top": 15.0,
                "width": 80.0,
                "height": 12.0,
            }

        citation = {
            "id": str(point.id),
            "page": page_num,
            "page_number": page_num,
            "pageIndex": page_index,
            "snippet": text[:350] if len(text) > 350 else text,
            "bbox": bbox,
            "boxes": boxes if boxes else [bbox],
            "coordinates": bbox,
            "score": getattr(point, "score", None),
            "contentType": content_type,
            "section": section,
            "caption": caption,
            "documentId": point_doc_id,
            "documentTitle": point_doc_title,
        }
        citations.append(citation)

        prefix = f"[{point_doc_title}] [Page {page_num}]" if is_comparison else f"[Page {page_num}]"
        if section:
            prefix += f" [Section: {section}]"
        if content_type == "table":
            prefix += " [Table]"
        elif content_type == "diagram":
            prefix += " [Diagram/Figure]"
        formatted.append(f"{prefix}\n{text}")

    # Store citations in userdata so the speaking state handler can broadcast them
    context.userdata["pending_citations"] = citations

    # Also publish immediate citations_retrieved event over LiveKit data channel
    job_ctx = get_job_context(required=False)
    if job_ctx and job_ctx.room and job_ctx.room.local_participant:
        try:
            spotlight = None
            if citations:
                primary = citations[0]
                spotlight = {
                    "page_number": primary["page_number"],
                    "pageIndex": primary["pageIndex"],
                    "coordinates": primary["coordinates"],
                    "section": primary.get("section"),
                    "snippet": primary["snippet"],
                    "citationId": primary["id"],
                    "documentId": primary.get("documentId"),
                    "documentTitle": primary.get("documentTitle"),
                }
            payload = json.dumps({
                "type": "citations_retrieved",
                "citations": citations,
                "spotlight": spotlight,
                "documentId": primary.get("documentId") if citations else None,
            }).encode("utf-8")
            asyncio.create_task(
                job_ctx.room.local_participant.publish_data(
                    payload,
                    reliable=True,
                    topic="citations",
                )
            )
        except Exception as e:
            logger.warning("Failed to publish citations data packet: %s", e)

    return "\n\n".join(formatted)

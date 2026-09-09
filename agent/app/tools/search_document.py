"""@function_tool search_document(...) - the agent's RAG lookup tool.

The Qdrant collection to query is read from room metadata (parsed in
main.py's entrypoint) and passed in via RunContext userdata, so this tool
stays a pure function of (query, collection) plus the closure/context.
"""
import asyncio
import json
import logging
from livekit.agents import RunContext, function_tool, get_job_context

from app.rag.embeddings import embed_query
from app.rag.retriever import retrieve_hybrid_chunks

logger = logging.getLogger("pdf-rag-agent.tool")


@function_tool()
async def search_document(context: RunContext, query: str) -> str:
    """Search the uploaded PDF for content relevant to the user's question.

    Args:
        query: The user's question or the topic to search for in the document.
    """
    collection = context.userdata.get("collection")
    if not collection:
        return "No document is currently associated with this session."

    query_vector = embed_query(query)
    points = retrieve_hybrid_chunks(collection, query, query_vector)

    if not points:
        return "No relevant content was found in the document for that query."

    formatted = []
    citations = []

    for point in points:
        text = point.payload.get("text", "")
        page = point.payload.get("page", 1)
        bbox = point.payload.get("bbox")
        boxes = point.payload.get("boxes")
        content_type = point.payload.get("contentType", "text")
        section = point.payload.get("section")
        caption = point.payload.get("caption")

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
            "pageIndex": page_index,
            "snippet": text[:350] if len(text) > 350 else text,
            "bbox": bbox,
            "boxes": boxes if boxes else [bbox],
            "score": getattr(point, "score", None),
            "contentType": content_type,
            "section": section,
            "caption": caption,
        }
        citations.append(citation)

        prefix = f"[Page {page_num}]"
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
            payload = json.dumps({
                "type": "citations_retrieved",
                "citations": citations,
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

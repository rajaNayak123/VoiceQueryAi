"""@function_tool search_document(...) - the agent's RAG lookup tool.

The Qdrant collection to query is read from room metadata (parsed in
main.py's entrypoint) and passed in via RunContext userdata, so this tool
stays a pure function of (query, collection) plus the closure/context.
"""
from livekit.agents import RunContext, function_tool

from app.rag.embeddings import embed_query
from app.rag.retriever import retrieve_chunks


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
    points = retrieve_chunks(collection, query_vector)

    if not points:
        return "No relevant content was found in the document for that query."

    formatted = []
    for point in points:
        text = point.payload.get("text", "")
        page = point.payload.get("page", "?")
        formatted.append(f"[Page {page}] {text}")

    return "\n\n".join(formatted)

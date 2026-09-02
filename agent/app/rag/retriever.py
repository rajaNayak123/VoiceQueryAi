"""Qdrant query logic: top-k retrieval for a given collection."""
from qdrant_client import QdrantClient
from qdrant_client.http.models import ScoredPoint

from app.config import settings

# Only pass api_key for HTTPS (cloud) endpoints — avoids "insecure connection" warning on localhost
_is_local = settings.qdrant_url.startswith("http://")
_qdrant = QdrantClient(
    url=settings.qdrant_url,
    api_key=None if _is_local else settings.qdrant_api_key,
)

TOP_K = 4


def retrieve_chunks(collection: str, query_vector: list[float]) -> list[ScoredPoint]:
    """Return the top-k matching points (with `text`/`page` payload) for a query vector."""
    results = _qdrant.query_points(
        collection_name=collection,
        query=query_vector,
        limit=TOP_K,
        with_payload=True,
    )
    return results.points

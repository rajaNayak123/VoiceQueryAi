"""Query-time embedding via HuggingFace Inference Providers API.

Must use the SAME model + provider as the Node ingestion pipeline
(backend/src/services/embeddings.ts) so query vectors and stored chunk
vectors live in the same space.

IMPORTANT: the legacy api-inference.huggingface.co host is retired and
returns HTTP 410. Use huggingface_hub.InferenceClient with
provider="hf-inference", which routes through router.huggingface.co.
"""
import time

from huggingface_hub import InferenceClient

from app.config import settings

EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"

_client = InferenceClient(provider="hf-inference", api_key=settings.huggingface_api_key)

MAX_RETRIES = 5
BASE_DELAY_SECONDS = 0.5


def embed_query(text: str) -> list[float]:
    """Embed a single query string, retrying on cold-start/rate-limit errors."""
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES):
        try:
            result = _client.feature_extraction(text, model=EMBEDDING_MODEL)
            # result can be a 1D or 2D array-like; normalize to a flat list.
            vector = result[0] if hasattr(result[0], "__len__") else result
            return list(vector)
        except Exception as exc:  # noqa: BLE001 - broad on purpose, we retry
            last_error = exc
            delay = BASE_DELAY_SECONDS * (2**attempt)
            time.sleep(delay)

    raise RuntimeError(
        f"Failed to embed query after {MAX_RETRIES} attempts: {last_error}"
    )

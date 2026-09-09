"""Env var loading via pydantic-settings. Import `settings` anywhere config is needed."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str

    groq_api_key: str
    huggingface_api_key: str

    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None

    sarvam_api_key: str

    cohere_api_key: str | None = None
    reranker_model: str = "BAAI/bge-reranker-base"

    redis_url: str = "redis://127.0.0.1:6379"
    semantic_cache_enabled: bool = True
    semantic_cache_threshold: float = 0.90
    semantic_cache_ttl_seconds: int = 86400 * 7
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None


settings = Settings()

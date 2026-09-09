"""SemanticCacheLLM: Transparent LLM wrapper that skips inference on semantic cache hits.

Integrates with LiveKit's LLM interface:
- Intercepts incoming user chat turns.
- Looks up semantically similar questions in Redis using vector similarity.
- On HIT:
    - Bypasses Groq LLM inference completely.
    - Instantly emits cached citations to frontend for real-time PDF highlighting.
    - Streams cached response directly to Sarvam Bulbul TTS in < 2ms.
- On MISS:
    - Delegates to inner Groq LLM.
    - Captures generated response and citations.
    - Writes entry to Redis semantic cache asynchronously for future queries.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from livekit.agents import llm
from livekit.agents.llm import ChatChunk, ChatContext, ChoiceDelta, LLMStream
from livekit.agents.types import APIConnectOptions, NOT_GIVEN, NotGivenOr

from app.rag.semantic_cache import SemanticCache, semantic_cache

logger = logging.getLogger("semantic_cache_llm")


def _extract_last_user_query(chat_ctx: ChatContext) -> str | None:
    """Extract text of the most recent user message from ChatContext."""
    raw_messages = getattr(chat_ctx, "messages", None)
    messages = raw_messages() if callable(raw_messages) else (raw_messages or [])
    if not messages:
        return None

    for msg in reversed(messages):
        if getattr(msg, "role", None) == "user":
            content = getattr(msg, "content", None)
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, str):
                        parts.append(item)
                    elif hasattr(item, "text"):
                        parts.append(item.text)
                text = " ".join(parts).strip()
                if text:
                    return text
    return None


class CachedLLMStream(LLMStream):
    """Synthetic LLMStream that yields cached response text instantly with zero inference delay."""

    def __init__(
        self,
        llm_instance: llm.LLM,
        *,
        chat_ctx: ChatContext,
        text: str,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions | None = None,
    ) -> None:
        super().__init__(
            llm_instance,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options or APIConnectOptions(),
        )
        self._cached_text = text

    async def _run(self) -> None:
        # Emit the cached answer in a single assistant chunk
        chunk = ChatChunk(
            id=str(uuid.uuid4()),
            delta=ChoiceDelta(role="assistant", content=self._cached_text),
        )
        self._event_ch.send_nowait(chunk)


class InterceptingLLMStream(LLMStream):
    """Wraps an active LLMStream to capture generated response text and store it in cache."""

    def __init__(
        self,
        inner_stream: LLMStream,
        cache: SemanticCache,
        collection: str | None,
        query: str,
        userdata: dict[str, Any] | None,
    ) -> None:
        super().__init__(
            inner_stream._llm,
            chat_ctx=inner_stream._chat_ctx,
            tools=inner_stream._tools,
            conn_options=inner_stream._conn_options,
        )
        self._inner_stream = inner_stream
        self._cache = cache
        self._collection = collection
        self._query = query
        self._userdata = userdata
        self._accumulated: list[str] = []

    async def _run(self) -> None:
        try:
            async for chunk in self._inner_stream:
                if chunk.delta and chunk.delta.content:
                    self._accumulated.append(chunk.delta.content)
                self._event_ch.send_nowait(chunk)
        finally:
            full_response = "".join(self._accumulated).strip()
            if full_response and self._collection and self._cache.is_available():
                citations = self._userdata.get("pending_citations") if self._userdata else None
                # Asynchronously save to cache without blocking stream termination
                try:
                    self._cache.set(self._collection, self._query, full_response, citations)
                except Exception as err:
                    logger.debug("Failed to record query to semantic cache: %s", err)


class SemanticCacheLLM(llm.LLM):
    """Wrapper around an underlying LLM (e.g. Groq) adding semantic caching capabilities."""

    def __init__(
        self,
        inner_llm: llm.LLM,
        cache: SemanticCache | None = None,
    ) -> None:
        super().__init__()
        self._inner_llm = inner_llm
        self._cache = cache or semantic_cache
        self._collection: str | None = None
        self._document_id: str | None = None
        self._userdata: dict[str, Any] | None = None
        self._room: Any | None = None

    def set_context(
        self,
        collection: str | None,
        document_id: str | None = None,
        userdata: dict[str, Any] | None = None,
        room: Any | None = None,
    ) -> None:
        """Associate the current session's document metadata and room participant."""
        self._collection = collection
        self._document_id = document_id
        self._userdata = userdata
        self._room = room

    @property
    def model(self) -> str:
        return getattr(self._inner_llm, "model", "semantic-cache-llm")

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = APIConnectOptions(max_retry=3, retry_interval=2.0, timeout=10.0),
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[llm.ToolChoice] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN,
    ) -> LLMStream:
        user_query = _extract_last_user_query(chat_ctx)

        # Check semantic cache if we have an active document collection and a user query
        if user_query and self._collection and self._cache.is_available():
            cached = self._cache.get(self._collection, user_query)
            if cached is not None:
                logger.info(
                    "[SemanticCache] SKIPPING LLM INFERENCE! Serving cached answer (similarity: %.4f)",
                    cached.similarity,
                )

                # Broadcast citations to room for dynamic PDF paragraph highlighting
                if self._userdata is not None:
                    self._userdata["pending_citations"] = cached.citations

                if self._room and self._room.local_participant and cached.citations:
                    try:
                        payload = json.dumps({
                            "type": "citation_highlight",
                            "citations": cached.citations,
                            "agentSpeaking": True,
                            "documentId": self._document_id,
                            "fromCache": True,
                        }).encode("utf-8")
                        asyncio.create_task(
                            self._room.local_participant.publish_data(
                                payload,
                                reliable=True,
                                topic="citations",
                            )
                        )
                    except Exception as err:
                        logger.warning("Failed to publish cached citation packet: %s", err)

                # Return synthetic stream containing cached response text
                return CachedLLMStream(
                    self,
                    chat_ctx=chat_ctx,
                    text=cached.response,
                    tools=tools,
                    conn_options=conn_options,
                )

        # CACHE MISS: Delegate to inner Groq LLM and intercept output
        inner_stream = self._inner_llm.chat(
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
            parallel_tool_calls=parallel_tool_calls,
            tool_choice=tool_choice,
            extra_kwargs=extra_kwargs,
        )

        if user_query and self._collection and self._cache.is_available():
            return InterceptingLLMStream(
                inner_stream=inner_stream,
                cache=self._cache,
                collection=self._collection,
                query=user_query,
                userdata=self._userdata,
            )

        return inner_stream

"""Telemetry & Tracing Module for Voice Query Lifecycle.

Traces the complete query lifecycle across 4 core phases:
1. Speech-to-Text (STT) Transcription Latency
2. RAG Document Retrieval Latency (Dense + BM25 + Cross-Encoder Rerank)
3. LLM Time-to-First-Token (TTFT)
4. Text-to-Speech (TTS) Playback Latency

Implements OpenTelemetry spans with optional Langfuse / OTLP exporter support,
structured latency logging, and real-time LiveKit telemetry data broadcasts.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import Any

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace import SpanKind, Status, StatusCode

logger = logging.getLogger("telemetry.tracer")

# Initialize OpenTelemetry TracerProvider
_resource = Resource.create({
    "service.name": "pdf-voice-rag-agent",
    "service.version": "1.0.0",
})
_provider = TracerProvider(resource=_resource)

# Optional OTLP Exporter if endpoint configured
otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
if otlp_endpoint:
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        _otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        _provider.add_span_processor(BatchSpanProcessor(_otlp_exporter))
        logger.info("OpenTelemetry OTLP trace exporter connected to %s", otlp_endpoint)
    except Exception as e:
        logger.warning("Could not initialize OTLP exporter: %s", e)

trace.set_tracer_provider(_provider)
tracer = trace.get_tracer("voice-rag-lifecycle")


@dataclass
class TurnTelemetryMetrics:
    query: str
    stt_latency_ms: float
    retrieval_latency_ms: float
    llm_ttft_ms: float
    tts_playback_latency_ms: float
    total_e2e_ms: float
    is_cached: bool
    document_id: str | None = None
    collection: str | None = None
    timestamp: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class QueryLifecycleTracer:
    """Manages lifecycle spans and telemetry metrics for user voice turns."""

    def __init__(self) -> None:
        self.tracer = tracer

    def record_turn(
        self,
        query: str,
        stt_latency_ms: float,
        retrieval_latency_ms: float,
        llm_ttft_ms: float,
        tts_playback_latency_ms: float,
        is_cached: bool = False,
        document_id: str | None = None,
        collection: str | None = None,
        room: Any | None = None,
    ) -> TurnTelemetryMetrics:
        """Create an OpenTelemetry span and log structured query lifecycle metrics."""
        # Calculate total end-to-end latency
        total_e2e_ms = round(
            stt_latency_ms + retrieval_latency_ms + llm_ttft_ms + tts_playback_latency_ms,
            2,
        )

        metrics = TurnTelemetryMetrics(
            query=query,
            stt_latency_ms=round(stt_latency_ms, 2),
            retrieval_latency_ms=round(retrieval_latency_ms, 2),
            llm_ttft_ms=round(llm_ttft_ms, 2),
            tts_playback_latency_ms=round(tts_playback_latency_ms, 2),
            total_e2e_ms=total_e2e_ms,
            is_cached=is_cached,
            document_id=document_id,
            collection=collection,
            timestamp=time.time(),
        )

        # 1. Create OpenTelemetry Root Span with Child Span Phases
        try:
            with self.tracer.start_as_current_span(
                "voice_query_lifecycle",
                kind=SpanKind.SERVER,
                attributes={
                    "query.text": query[:120],
                    "document.id": document_id or "unknown",
                    "collection.name": collection or "unknown",
                    "latency.stt_ms": metrics.stt_latency_ms,
                    "latency.retrieval_ms": metrics.retrieval_latency_ms,
                    "latency.llm_ttft_ms": metrics.llm_ttft_ms,
                    "latency.tts_playback_ms": metrics.tts_playback_latency_ms,
                    "latency.total_e2e_ms": metrics.total_e2e_ms,
                    "cache.hit": is_cached,
                },
            ) as span:
                span.set_status(Status(StatusCode.OK))

                # STT child span
                with self.tracer.start_as_current_span(
                    "stt_transcription",
                    attributes={"duration_ms": metrics.stt_latency_ms},
                ):
                    pass

                # RAG retrieval child span
                if metrics.retrieval_latency_ms > 0:
                    with self.tracer.start_as_current_span(
                        "rag_retrieval",
                        attributes={
                            "duration_ms": metrics.retrieval_latency_ms,
                            "collection": collection or "unknown",
                        },
                    ):
                        pass

                # LLM child span
                with self.tracer.start_as_current_span(
                    "llm_inference",
                    attributes={
                        "ttft_ms": metrics.llm_ttft_ms,
                        "cached": is_cached,
                    },
                ):
                    pass

                # TTS playback child span
                with self.tracer.start_as_current_span(
                    "tts_playback",
                    attributes={"duration_ms": metrics.tts_playback_latency_ms},
                ):
                    pass
        except Exception as err:
            logger.debug("Error creating OpenTelemetry spans: %s", err)

        # 2. Structured telemetry summary log
        cache_indicator = "⚡ CACHE HIT" if is_cached else "🤖 LLM INFERENCE"
        logger.info(
            "[Telemetry] %s | STT: %.1fms | Retrieval: %.1fms | LLM TTFT: %.1fms | TTS Playback: %.1fms | Total E2E: %.1fms | Query: '%s'",
            cache_indicator,
            metrics.stt_latency_ms,
            metrics.retrieval_latency_ms,
            metrics.llm_ttft_ms,
            metrics.tts_playback_latency_ms,
            metrics.total_e2e_ms,
            query[:60] + "..." if len(query) > 60 else query,
        )

        # 3. Publish real-time telemetry packet over LiveKit room data channel
        if room and hasattr(room, "local_participant") and room.local_participant:
            try:
                import asyncio
                payload = json.dumps({
                    "type": "query_telemetry",
                    "metrics": metrics.to_dict(),
                }).encode("utf-8")
                asyncio.create_task(
                    room.local_participant.publish_data(
                        payload,
                        reliable=False,
                        topic="telemetry",
                    )
                )
            except Exception as e:
                logger.debug("Failed to publish telemetry data packet: %s", e)

        return metrics


# Global tracer instance
lifecycle_tracer = QueryLifecycleTracer()

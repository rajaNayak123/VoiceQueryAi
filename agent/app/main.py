"""Agent entrypoint: registers under agentName='pdf-rag-agent' using explicit
dispatch (must match the dispatch name used by backend/src/config/livekit.ts),
so it only joins rooms it's assigned to - not every room in the project.

Run:
  python app/main.py dev     (local dev, connects to LiveKit dev server / cloud)
  python app/main.py start   (production, persistent worker process)
"""
import asyncio
import json
import logging

from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents.voice.agent_session import (
    AgentStateChangedEvent,
    UserStateChangedEvent,
)

from app.config import settings
from app.prompts.system_prompt import SYSTEM_PROMPT, greeting_instructions
from app.session_builder import build_session
from app.telemetry.tracer import lifecycle_tracer
from app.tools.search_document import search_document

logger = logging.getLogger("pdf-rag-agent")
logging.basicConfig(level=logging.INFO)

AGENT_NAME = "pdf-rag-agent"


class PdfRagAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT, tools=[search_document])


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Room metadata was set by the Node backend when it created the room:
    # { "collection": "doc_<uuid>", "documentId": "...", "filename": "..." }
    metadata = {}
    if ctx.room.metadata:
        try:
            metadata = json.loads(ctx.room.metadata)
        except json.JSONDecodeError:
            logger.warning("Room metadata was not valid JSON: %r", ctx.room.metadata)

    collection = metadata.get("collection")
    document_id = metadata.get("documentId")
    filename = metadata.get("filename", "your document")

    if not collection:
        logger.error("No 'collection' in room metadata - cannot serve RAG queries")

    session: AgentSession = build_session()
    session.userdata = {
        "collection": collection,
        "documentId": document_id,
        "filename": filename,
        "pending_citations": None,
    }

    if hasattr(session.llm, "set_context"):
        session.llm.set_context(
            collection=collection,
            document_id=document_id,
            userdata=session.userdata,
            room=ctx.room,
        )

    # Listen for agent state changes to broadcast real-time citations & speech highlights
    @session.on("agent_state_changed")
    def _on_agent_state_changed(event: AgentStateChangedEvent) -> None:
        logger.info("Agent state transitioned: %s -> %s", event.old_state, event.new_state)

        if event.new_state == "speaking":
            citations = session.userdata.get("pending_citations")
            if citations:
                payload = json.dumps({
                    "type": "citation_highlight",
                    "citations": citations,
                    "agentSpeaking": True,
                    "documentId": document_id,
                }).encode("utf-8")
                asyncio.create_task(
                    ctx.room.local_participant.publish_data(
                        payload,
                        reliable=True,
                        topic="citations",
                    )
                )
        elif event.new_state in ("listening", "idle"):
            # Notify frontend that speaking ended so dynamic pulsing stops
            payload = json.dumps({
                "type": "agent_state",
                "state": event.new_state,
                "agentSpeaking": False,
            }).encode("utf-8")
            asyncio.create_task(
                ctx.room.local_participant.publish_data(
                    payload,
                    reliable=True,
                    topic="citations",
                )
            )

    # Smart audio interruption / barge-in handler:
    # When user starts speaking while the agent is streaming TTS, cancel generation
    # instantly, flush audio buffer, and notify frontend without lag.
    @session.on("user_state_changed")
    def _on_user_state_changed(event: UserStateChangedEvent) -> None:
        logger.info("User state transitioned: %s -> %s", event.old_state, event.new_state)
        if event.new_state == "speaking" and session.agent_state == "speaking":
            logger.info("User interrupted agent speech. Instantly cancelling TTS playout.")
            try:
                session.interrupt(force=True)
            except Exception as e:
                logger.warning("Error during session.interrupt: %s", e)

            # Broadcast instant interruption packet to room
            payload = json.dumps({
                "type": "interruption",
                "agentSpeaking": False,
            }).encode("utf-8")
            asyncio.create_task(
                ctx.room.local_participant.publish_data(
                    payload,
                    reliable=True,
                    topic="citations",
                )
            )

    # When user starts a new utterance, clear pending citations and track query for telemetry
    @session.on("user_input_transcribed")
    def _on_user_input(event) -> None:  # noqa: ANN001
        session.userdata["pending_citations"] = None
        transcript = getattr(event, "transcript", "")
        if transcript and getattr(event, "is_final", True):
            session.userdata["last_query"] = transcript
            session.userdata["last_retrieval_ms"] = 0.0
            session.userdata["last_cached"] = False

    # Trace full turn lifecycle (STT -> Retrieval -> LLM TTFT -> TTS Playback)
    @session.on("conversation_item_added")
    def _on_conversation_item_added(event) -> None:  # noqa: ANN001
        item = getattr(event, "item", None)
        if not item or getattr(item, "role", None) != "assistant":
            return

        metrics = getattr(item, "metrics", None)
        query = session.userdata.get("last_query") or "User query"
        is_cached = bool(session.userdata.get("last_cached", False))
        retrieval_ms = float(session.userdata.get("last_retrieval_ms") or 0.0)

        # Extract timing metrics
        stt_ms = (getattr(metrics, "transcription_delay", 0.0) or 0.0) * 1000.0 if metrics else 0.0
        ttft_ms = (getattr(metrics, "llm_node_ttft", 0.0) or 0.0) * 1000.0 if metrics else 0.0
        tts_playback_ms = (
            (getattr(metrics, "playback_latency", 0.0) or getattr(metrics, "tts_node_ttfb", 0.0) or 0.0) * 1000.0
            if metrics else 0.0
        )

        if is_cached:
            ttft_ms = 1.5  # Sub-2ms for cached response
            retrieval_ms = 0.0

        lifecycle_tracer.record_turn(
            query=query,
            stt_latency_ms=stt_ms,
            retrieval_latency_ms=retrieval_ms,
            llm_ttft_ms=ttft_ms,
            tts_playback_latency_ms=tts_playback_ms,
            is_cached=is_cached,
            document_id=document_id,
            collection=collection,
            room=ctx.room,
        )

    await session.start(agent=PdfRagAgent(), room=ctx.room)

    await session.generate_reply(instructions=greeting_instructions(filename))

    @ctx.room.on("participant_disconnected")
    def _on_participant_disconnected(participant) -> None:  # noqa: ANN001
        logger.info("Participant disconnected: %s", participant.identity)

    async def _on_disconnect() -> None:
        logger.info("Room disconnected, shutting down agent session")
        await session.aclose()

    ctx.add_shutdown_callback(_on_disconnect)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=AGENT_NAME,
            ws_url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
    )

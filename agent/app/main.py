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
from livekit.agents.voice.agent_session import AgentStateChangedEvent

from app.config import settings
from app.prompts.system_prompt import SYSTEM_PROMPT, greeting_instructions
from app.session_builder import build_session
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

    # When user starts a new utterance, clear pending citations
    @session.on("user_input_transcribed")
    def _on_user_input(event) -> None:  # noqa: ANN001
        session.userdata["pending_citations"] = None

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

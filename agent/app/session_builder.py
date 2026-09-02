"""Builds the AgentSession: STT (Sarvam Saaras) -> LLM (Groq) -> TTS (Sarvam Bulbul).

Key decisions locked in by the build plan:
- turn_detection="stt": Sarvam's STT plugin handles voice activity detection
  and turn-taking internally. Do NOT pass a separate `vad=` (Silero or the
  LiveKit turn-detector) - Sarvam's own docs say layering these on top hurts
  turn-taking accuracy, it doesn't help it.
- min_endpointing_delay is deprecated on AgentSession - skipped entirely.
  Use turn_handling=TurnHandlingOptions(...) later if custom endpointing
  tuning is ever needed.
- Groq retired llama-3.3-70b-versatile and llama-3.1-8b-instant on
  Aug 16, 2026. Use the gpt-oss models instead.
"""
from livekit.agents import AgentSession
from livekit.plugins import groq, sarvam

from app.config import settings

# "openai/gpt-oss-20b" trades some quality for lower latency; swap to
# "openai/gpt-oss-120b" for higher quality if latency budget allows.
LLM_MODEL = "openai/gpt-oss-20b"

# language="unknown" lets Sarvam auto-detect the spoken language; hardcode
# e.g. "hi-IN" or "en-IN" if the deployment is single-language.
STT_LANGUAGE = "unknown"
TTS_TARGET_LANGUAGE = "en-IN"
# Must be one of bulbul:v3's compatible speakers (verified against the
# installed livekit-plugins-sarvam package - it raises ValueError at
# construction time for any other name): shubh, ritu, rahul, pooja, simran,
# kavya, amit, ratan, rohan, dev, ishita, shreya, manan, sumit, priya,
# aditya, kabir, neha, varun, roopa, aayan, ashutosh, advait, amelia,
# sophia, suhani, rupali, tanya, shruti, kavitha.
TTS_SPEAKER = "pooja"


def build_session() -> AgentSession:
    return AgentSession(
        stt=sarvam.STT(
            model="saaras:v3",
            language=STT_LANGUAGE,
            mode="transcribe",
            flush_signal=True,
            api_key=settings.sarvam_api_key,
        ),
        llm=groq.LLM(
            model=LLM_MODEL,
            api_key=settings.groq_api_key,
        ),
        tts=sarvam.TTS(
            model="bulbul:v3",
            target_language_code=TTS_TARGET_LANGUAGE,
            speaker=TTS_SPEAKER,
            api_key=settings.sarvam_api_key,
        ),
        turn_detection="stt",
        # No `vad=` on purpose - see module docstring.
        #
        # Verified against livekit-agents 1.7.1: `turn_detection=` still
        # works but now logs "turn_detection is deprecated and will be
        # removed in v2.0. Use turn_handling=TurnHandlingOptions(...)
        # instead" - newer than what this plan was written against. Not a
        # functional problem today; when livekit-agents 2.0 ships, migrate
        # this to turn_handling=TurnHandlingOptions(...) (which superseded
        # both turn_detection and min_endpointing_delay).
    )

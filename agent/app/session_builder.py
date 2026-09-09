"""Builds the AgentSession: STT (Sarvam Saaras) -> LLM (Groq) -> TTS (Sarvam Bulbul).

Smart Interruption (Barge-in):
- vad=None explicitly opts out of the bundled Silero VAD, preventing VAD flush delays
  and allowing Sarvam's native speech start/stop signals to drive turn-taking cleanly.
- turn_handling=TurnHandlingOptions configures instant 150ms interruption detection
  (min_duration=0.15, min_words=0) so TTS playout cuts off on the first user syllable.
- resume_false_interruption=False prevents confusing speech resumption after interruption.
"""
from livekit.agents import (
    AgentSession,
    EndpointingOptions,
    InterruptionOptions,
    TurnHandlingOptions,
)
from livekit.plugins import groq, sarvam

from app.config import settings

# "openai/gpt-oss-20b" trades some quality for lower latency; swap to
# "openai/gpt-oss-120b" for higher quality if latency budget allows.
LLM_MODEL = "openai/gpt-oss-20b"

# language="unknown" lets Sarvam auto-detect the spoken language; hardcode
# e.g. "hi-IN" or "en-IN" if the deployment is single-language.
STT_LANGUAGE = "unknown"
TTS_TARGET_LANGUAGE = "en-IN"
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
        # Explicitly opt out of default bundled Silero VAD to prevent collision with Sarvam STT
        vad=None,
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
        turn_handling=TurnHandlingOptions(
            turn_detection="stt",
            interruption=InterruptionOptions(
                enabled=True,
                min_duration=0.15,  # 150ms instant barge-in response
                min_words=0,        # Cut off immediately on first syllable
                discard_audio_if_uninterruptible=True,
                resume_false_interruption=False,  # Never replay interrupted text
                false_interruption_timeout=None,
                backchannel_boundary=None,
            ),
            endpointing=EndpointingOptions(
                min_delay=0.35,  # Low-latency turn endpointing
                max_delay=2.0,
            ),
        ),
    )

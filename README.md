# PDF Voice RAG Agent

Upload a PDF, then have a live voice conversation (Hindi/English/other Indian
languages) with an AI agent that answers questions strictly from that document,
citing page numbers.

## Architecture

```
React Frontend --(upload PDF)--> Node/Express Backend --(parse/chunk/embed)--> Qdrant
       |                                |
       |<--(LiveKit token)--------------|
       |
   joins LiveKit room  <---dispatch---  LiveKit Python Agent (STT: Sarvam Saaras,
                                          LLM: Groq gpt-oss, TTS: Sarvam Bulbul)
```

See `voiceQuery-Ai.md` (build plan) for the full phase-by-phase design and the
locked-in technical decisions (models, hosts, deprecations to avoid).

## Services

- `backend/` — Express + TypeScript + Prisma. Handles PDF upload, ingestion
  (LangChain JS chunking + HuggingFace embeddings + Qdrant upsert), and
  LiveKit room/token/dispatch creation.
- `agent/` — Python 3.11, LiveKit Agents SDK. Joins a dispatched room, reads
  the Qdrant collection to query from room metadata, and runs a
  STT -> LLM (+ RAG tool call) -> TTS voice pipeline.
- `frontend/` — React + Vite. Upload screen + live voice call screen.

## Local development

```bash
cp .env.example .env            # fill in real credentials
docker compose up -d postgres qdrant

cd backend && npm install && npx prisma migrate dev && npm run dev
cd agent && python3.11 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app/main.py dev
cd frontend && npm install && npm run dev
```

## Status

Implements Phase 0 through Phase 5 of the build plan:
- Phase 0/Folder Structure — monorepo scaffold
- Phase 1 — Postgres schema (Prisma) + Express skeleton + upload middleware
- Phase 2 — PDF ingestion pipeline (LangChain JS chunking, HF embeddings, Qdrant upsert)
- Phase 3 — LiveKit room creation, token issuance, explicit agent dispatch
- Phase 4 — Python LiveKit agent (Sarvam STT/TTS, Groq LLM, RAG tool call)
- Phase 5 — React frontend (upload + live call UI)

Phases 6-8 (integration pass, hardening, deployment) are not implemented here —
see the build plan for what's left.

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

## Telemetry & Tracing (OpenTelemetry)

The voice agent is instrumented with OpenTelemetry to track and trace the complete voice-query lifecycle across four granular phases:

1. **Speech-to-Text (STT) Latency**: Time taken to transcribe the caller's spoken audio stream via Sarvam Saaras.
2. **Retrieval Latency**: Hybrid search (Dense BGE + BM25) + Cross-Encoder re-ranking against Qdrant vector store.
3. **LLM Time-to-First-Token (TTFT)**: Latency until the first token stream emerges from Groq LLM (or immediate zero-latency return on Semantic Cache hit).
4. **Text-to-Speech (TTS) Playback Latency**: Streaming audio chunk synthesis and client playback via Sarvam Bulbul.

Each query cycle emits structured telemetry spans and broadcasts latency events over the LiveKit data channel for real-time monitoring and observability.

---

## RAG Evaluation Benchmarks (50 QA Pairs)

Automated evaluation benchmarks were executed across **50 domain-specific QA pairs** testing complex multi-agent flows, technical terminology, state management, and tabular data. The suite measures the **RAG Triad** (Faithfulness, Answer Relevance, Context Recall) comparing **Baseline Dense Search** vs. **Optimized (Hybrid Search + BAAI/bge-reranker + Upstash/Redis Semantic Cache)**:

| Metric | Baseline (Dense Vector Search) | Optimized (Hybrid + Reranker + Semantic Cache) | Delta / Impact |
| :--- | :---: | :---: | :---: |
| **Faithfulness** | **100.00%** | **100.00%** | Zero hallucinations; strict grounding in context |
| **Answer Relevance** | 63.76% | **65.42%** | **+1.66%** higher query-response semantic alignment |
| **Context Recall** | 94.00% | **98.00%** | **+4.00%** boost via hybrid BM25 lexical recall |
| **Uncached Latency (p50)** | 566.7 ms | 1412.6 ms | Cross-encoder precision trade-off on cold queries |
| **Uncached Latency (p95)** | 941.2 ms | 1777.7 ms | Deep multi-stage candidate scoring |
| **Cached Query Latency** | N/A | **< 5.0 ms** | **99.6% reduction** for repeated/similar queries |

Detailed per-sample benchmark results are saved in [`agent/evaluation/benchmark_results.json`](file:///Users/rajanayak/Desktop/Projects/voiceQueryAi/agent/evaluation/benchmark_results.json).

---

## Status

Implements Phase 0 through Phase 5 of the build plan:
- Phase 0/Folder Structure — monorepo scaffold
- Phase 1 — Postgres schema (Prisma) + Express skeleton + upload middleware
- Phase 2 — PDF ingestion pipeline (LangChain JS chunking, HF embeddings, Qdrant upsert)
- Phase 3 — LiveKit room creation, token issuance, explicit agent dispatch
- Phase 4 — Python LiveKit agent (Sarvam STT/TTS, Groq LLM, RAG tool call)
- Phase 5 — React frontend (upload + live call UI)
- Extended — Citations & Bounding Box Highlighting, Hybrid BM25+Dense Reranker, Barge-in Interruption, BullMQ/Redis Async Ingestion, Upstash Semantic Cache, OpenTelemetry Tracing & RAGAS Benchmarking.


# PDF Voice RAG Agent — Full Build Plan

## Final Architecture

```
┌─────────────┐      1. upload PDF        ┌──────────────────────┐11
│   React     │ ────────────────────────▶ │   Node.js Backend    │
│  Frontend   │                            │  (Express)           │
│             │ ◀──── 2. LiveKit token ─── │                      │
└─────────────┘                            │  - PDF parse/chunk   │
      │                                    │    (LangChain JS)    │
      │ 3. join room (livekit-client)      │  - Embed chunks      │
      │                                    │    (HF Inference API)│
      ▼                                    │  - Upsert → Qdrant   │
┌─────────────┐   room metadata:           │  - Store metadata    │
│ LiveKit      │   {collection_id}         │    (Postgres)        │
│ Cloud/Server│ ◀────────────────────────  │  - Dispatch agent    │
└─────────────┘                            └──────────────────────┘
      │
      │ 4. agent joins room
      ▼
┌─────────────────────────────────────────────────────┐
│   LiveKit Agent (Python)                             │
│   STT(Sarvam Saaras) → LLM(Groq Llama)               │
│         ↑ tool call: retrieve(query)                 │
│         │      → embed query (HF Inference API)      │
│         │      → search Qdrant collection             │
│         │      → inject top-k chunks into context     │
│   → TTS (Sarvam Bulbul) → audio back to user          │
└─────────────────────────────────────────────────────┘
```

**Key design decisions locked in:**
| Concern | Choice | Why |
|---|---|---|
| PDF parsing/chunking | LangChain **JS** (`langchain`, `@langchain/community`) in Node backend | Matches your stated Node backend; LangChain JS has full PDF loader + splitter support |
| Embeddings | HuggingFace **Inference Providers API** (`BAAI/bge-small-en-v1.5`, 384-dim) via `router.huggingface.co`, called from both Node (ingestion) and Python (query time) | Same model + same routed endpoint = identical vector space guaranteed; no need to load a model twice in two languages. The old `api-inference.huggingface.co` host is retired (HTTP 410) |
| Vector DB | Qdrant, **one collection per document** (`doc_<uuid>`) | Clean isolation, easy cleanup, avoids cross-document leakage during retrieval |
| LLM | Groq (`openai/gpt-oss-120b`, or `openai/gpt-oss-20b` for lower latency) | Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` (shutdown completed Aug 16, 2026) — `gpt-oss-120b`/`gpt-oss-20b` are Groq's current recommended replacements |
| STT | Sarvam **Saaras** (`saaras:v3`) via `livekit-plugins-sarvam` | Per your request; strong for Indian-language + English voice input, ~70ms processing latency |
| TTS | Sarvam **Bulbul** (`bulbul:v3`) via `livekit-plugins-sarvam` | Per your request; pairs naturally with Sarvam STT, 22+ Indian languages plus English |
| VAD / turn-taking | Handled **internally by the Sarvam STT plugin** — don't pass a separate `vad=` to `AgentSession`; set `turn_detection="stt"` and `flush_signal=True` on the STT config. Skip `min_endpointing_delay` entirely — it's deprecated on `AgentSession` (use `turn_handling=TurnHandlingOptions(...)` if you ever need custom endpointing tuning), and Sarvam's own current quickstart doesn't set it | Sarvam's own docs recommend against layering Silero VAD or the LiveKit turn-detector on top — the plugin already emits start/end-of-speech events, and doubling up hurts turn-taking accuracy |
| Metadata DB | Postgres | Tracks document → collection mapping, processing status, room → document mapping |
| Node↔Python bridge | LiveKit **room metadata**, set when Node creates the room | Agent reads `job.room.metadata` on join to know which Qdrant collection to query — no separate messaging system needed |

---

## Phase 0 — Accounts & Environment Setup

**Goal:** every credential in place before writing code.

Prompt to give your coding assistant:
> Set up a monorepo with three folders: `backend/` (Node.js + Express + TypeScript), `agent/` (Python 3.11, LiveKit Agents SDK), `frontend/` (React + Vite). Create a root `.env.example` listing: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GROQ_API_KEY`, `HUGGINGFACE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `SARVAM_API_KEY`, `DATABASE_URL` (Postgres), `PORT`. Add `.gitignore` for `node_modules`, `venv`, `.env`, uploaded files dir. Also scaffold each folder using the clean structure defined in the **Folder Structure** section below.

Manual steps you need to do (not code):
1. Create a LiveKit Cloud project (or self-host with `livekit-server`) → get `LIVEKIT_URL`, API key/secret.
2. Get a Groq API key (console.groq.com).
3. Get a HuggingFace API token with Inference API access.
4. Spin up Qdrant — either Qdrant Cloud free tier or `docker run -p 6333:6333 qdrant/qdrant`.
5. Get a Sarvam API key (dashboard.sarvam.ai) — used for both STT and TTS.
6. Provision a Postgres instance (local Docker or a free-tier hosted one like Neon/Supabase).

---

## Folder Structure

Scaffold exactly this layout so the three services stay decoupled and each has an obvious place for new code.

```
pdf-voice-rag-agent/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts                 # loads & validates env vars (zod schema)
│   │   │   ├── db.ts                  # Postgres/Prisma client init
│   │   │   ├── qdrant.ts              # Qdrant client init
│   │   │   └── livekit.ts             # LiveKit RoomServiceClient / AgentDispatchClient / AccessToken helpers
│   │   ├── modules/
│   │   │   ├── documents/
│   │   │   │   ├── documents.controller.ts   # upload, status routes
│   │   │   │   ├── documents.service.ts      # orchestrates ingest pipeline
│   │   │   │   ├── documents.repository.ts   # Postgres queries for `documents` table
│   │   │   │   └── documents.routes.ts
│   │   │   └── sessions/
│   │   │       ├── sessions.controller.ts    # create session, issue token, dispatch agent
│   │   │       ├── sessions.service.ts
│   │   │       ├── sessions.repository.ts    # Postgres queries for `sessions` table
│   │   │       └── sessions.routes.ts
│   │   ├── services/
│   │   │   ├── pdfLoader.ts            # LangChain PDFLoader wrapper
│   │   │   ├── textSplitter.ts         # RecursiveCharacterTextSplitter wrapper
│   │   │   ├── embeddings.ts           # HuggingFace Inference API client + retry/backoff
│   │   │   ├── vectorStore.ts          # Qdrant collection create/upsert helpers
│   │   │   └── ingestQueue.ts          # background job queue (p-queue → BullMQ later)
│   │   ├── middleware/
│   │   │   ├── upload.ts               # multer config (PDF-only, size limit)
│   │   │   ├── errorHandler.ts
│   │   │   └── rateLimiter.ts
│   │   ├── db/
│   │   │   ├── schema.prisma           # or migrations/ if using raw SQL + node-pg-migrate
│   │   │   └── migrations/
│   │   ├── types/
│   │   │   └── index.ts                # shared TS interfaces (Document, Session, etc.)
│   │   ├── utils/
│   │   │   └── logger.ts
│   │   ├── app.ts                      # Express app setup, route mounting
│   │   └── server.ts                   # entrypoint, starts HTTP server
│   ├── uploads/                        # temp storage for incoming PDFs (gitignored)
│   ├── tests/
│   │   ├── documents.test.ts
│   │   └── fixtures/sample.pdf
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── agent/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # entrypoint(ctx), worker registration, cli.run_app
│   │   ├── config.py                   # env var loading (pydantic-settings)
│   │   ├── session_builder.py          # builds AgentSession (STT/LLM/TTS config)
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   └── search_document.py      # @function_tool retrieve() implementation
│   │   ├── rag/
│   │   │   ├── __init__.py
│   │   │   ├── embeddings.py           # HF Inference API client (query-time embedding)
│   │   │   └── retriever.py            # Qdrant query logic
│   │   └── prompts/
│   │       └── system_prompt.py        # baked-in instructions string
│   ├── tests/
│   │   └── test_retriever.py
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts               # fetch wrappers: uploadDocument(), getStatus(), createSession()
│   │   ├── components/
│   │   │   ├── upload/
│   │   │   │   ├── UploadDropzone.tsx
│   │   │   │   └── ProcessingStatus.tsx
│   │   │   ├── call/
│   │   │   │   ├── CallRoom.tsx        # wraps LiveKitRoom
│   │   │   │   ├── MicControl.tsx
│   │   │   │   ├── TranscriptPanel.tsx
│   │   │   │   ├── AgentVisualizer.tsx # BarVisualizer wrapper
│   │   │   │   └── EndCallButton.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx
│   │   │       └── Spinner.tsx
│   │   ├── hooks/
│   │   │   ├── useDocumentUpload.ts
│   │   │   └── useDocumentStatusPoll.ts
│   │   ├── pages/
│   │   │   ├── UploadPage.tsx
│   │   │   └── CallPage.tsx
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── .env.example                    # VITE_LIVEKIT_URL, VITE_API_BASE_URL
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docker-compose.yml                  # local dev: postgres, qdrant, backend, agent
├── DEPLOYMENT.md
└── README.md
```

Prompt for the folder-structure scaffolding step:
> Create the exact folder/file layout above for `backend/`, `agent/`, and `frontend/`, with empty files containing only a top-of-file comment describing their purpose (no logic yet). Add a `docker-compose.yml` at the root that spins up local Postgres and Qdrant containers for development, plus placeholders for `backend` and `agent` services. This scaffold is the baseline every later phase writes into — don't restructure it as you go.

---

## Phase 1 — Postgres Schema & Node Backend Skeleton

**Goal:** backend can accept uploads and track document state.

Prompt:
> In `backend/`, set up Express + TypeScript with a Postgres connection (use `pg` or Prisma — Prisma preferred for migrations). Create this schema:
> - `documents`: `id (uuid pk)`, `filename`, `status (enum: uploading|processing|ready|failed)`, `qdrant_collection (text)`, `page_count (int)`, `created_at`
> - `sessions`: `id (uuid pk)`, `document_id (fk)`, `room_name (text)`, `created_at`
>
> Add a health-check route `GET /health`. Add multer (or `express-fileupload`) middleware configured to accept only `application/pdf`, max 20MB, storing to `backend/uploads/<uuid>.pdf` temporarily.

---

## Phase 2 — PDF Ingestion Pipeline (LangChain JS)

**Goal:** `POST /api/documents/upload` → parsed, chunked, embedded, stored in Qdrant, status flips to `ready`.

Prompt:
> Implement `backend/src/services/ingest.ts`:
> 1. Use `@langchain/community/document_loaders/fs/pdf` (`PDFLoader`) to load the uploaded PDF into LangChain `Document` objects (one per page, with page number metadata).
> 2. Split with `RecursiveCharacterTextSplitter` — `chunkSize: 1000`, `chunkOverlap: 150`. Preserve page number in chunk metadata for citation later.
> 3. Generate embeddings for each chunk using HuggingFace's Inference Providers API, model `BAAI/bge-small-en-v1.5`. **Important:** the legacy `api-inference.huggingface.co` host is fully retired and now returns HTTP 410 — use `@huggingface/inference`'s `InferenceClient` with `provider: 'hf-inference'`, or raw `fetch` to `https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5/pipeline/feature-extraction` if you need a manual call. Implement retry with exponential backoff either way — HF inference cold-starts can be slow.
> 4. Create a new Qdrant collection named `doc_<documentId>` with vector size `384`, distance `Cosine`, using `@qdrant/js-client-rest`.
> 5. Upsert all chunk vectors with payload `{ text, page, documentId }`.
> 6. Update the `documents` row: set `status = 'ready'`, `qdrant_collection = doc_<documentId>`, `page_count`.
> 7. Wrap the whole flow so upload returns immediately with `status: processing` and `documentId`, and ingestion runs as a background job (use a simple in-process queue like `p-queue` for now; note in a comment that this should move to BullMQ/Redis for production multi-instance deployments).
>
> Also implement `GET /api/documents/:id/status` for the frontend to poll.

**Watch-out to flag to your assistant explicitly:** HF Inference API free tier rate-limits and can 503 on cold model load — the retry/backoff logic isn't optional, it will fail without it on first real PDF.

---

## Phase 3 — Room Creation & LiveKit Token/Dispatch

**Goal:** once a document is `ready`, the frontend can request a room and get an agent dispatched to it that knows which collection to query.

Prompt:
> Implement `POST /api/sessions` (body: `{ documentId }`):
> 1. Verify `documents.status === 'ready'` for that id; if not, return 409.
> 2. Generate a unique `roomName` (e.g. `room-<uuid>`).
> 3. Use `livekit-server-sdk` (Node) to create the room explicitly via `RoomServiceClient.createRoom()`, passing `metadata: JSON.stringify({ collection: document.qdrant_collection, documentId })`.
> 4. Use `AgentDispatchClient` (from `livekit-server-sdk`) to explicitly dispatch your Python agent (`agentName: 'pdf-rag-agent'`) to that room — this avoids the agent auto-joining every room in your LiveKit project.
> 5. Generate an `AccessToken` for the frontend user (identity = a generated user id, grants: `roomJoin`, `room: roomName`, `canPublish: true`, `canSubscribe: true`).
> 6. Insert a `sessions` row.
> 7. Return `{ token, roomName, livekitUrl }` to the frontend.

---

## Phase 4 — LiveKit Python Agent

**Goal:** the actual voice+RAG agent.

Prompt:
> In `agent/`, using `livekit-agents` (latest) and `livekit-plugins-sarvam`, `livekit-plugins-groq`, build the modules laid out under `agent/app/` in the Folder Structure section:
>
> 1. `main.py`: register the agent under `agentName: 'pdf-rag-agent'` (must match the dispatch name from Phase 3) using explicit dispatch mode — not automatic — so it only joins rooms it's assigned to. Wire up `cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))`.
> 2. In `entrypoint(ctx)`: connect to the room, read `ctx.room.metadata`, parse JSON to get `collection` (Qdrant collection name) and `filename`.
> 3. `session_builder.py` — build the `AgentSession`:
>    - `stt`: `sarvam.STT(model="saaras:v3", language="unknown", mode="transcribe", flush_signal=True)` — `language="unknown"` lets Sarvam auto-detect, or hardcode e.g. `"en-IN"` if you know your users' language.
>    - `llm`: `groq.LLM(model="openai/gpt-oss-120b")` (or `openai/gpt-oss-20b` for lower latency — see Open Decisions). **Note:** Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on Aug 16, 2026 — those model strings will now error, use the `gpt-oss` models instead.
>    - `tts`: `sarvam.TTS(model="bulbul:v3", target_language_code="en-IN", speaker="<pick from Sarvam's speaker list>")`.
>    - `turn_detection="stt"` on the session. Don't set `min_endpointing_delay` — it's deprecated on `AgentSession`; use `turn_handling=TurnHandlingOptions(...)` instead if you need custom endpointing tuning later.
>    - **Do not** pass a separate `vad=` — Sarvam's STT plugin handles voice activity detection internally; adding Silero or the LiveKit turn-detector plugin on top actively hurts turn-taking here.
> 4. `tools/search_document.py` — a `@function_tool` `search_document(context, query: str)` that:
>    - Calls `rag/embeddings.py` (HuggingFace's Inference Providers API via `huggingface_hub.InferenceClient(provider="hf-inference")`, same model as ingestion: `BAAI/bge-small-en-v1.5` — never hit the retired `api-inference.huggingface.co` host, it returns HTTP 410) to embed the query.
>    - Calls `rag/retriever.py` to query the Qdrant collection (`collection` read from room metadata, passed into the tool via closure or `RunContext` userdata) for the top 4 matches using `qdrant-client`.
>    - Returns the matched chunk texts + page numbers as a formatted string for the LLM to use as context.
> 5. `prompts/system_prompt.py` — bake in: *"You are a voice assistant answering questions strictly about the uploaded PDF the user is discussing. Always call `search_document` before answering a factual question about the document's content. Cite the page number when you reference something from it. If the retrieved context doesn't contain the answer, say so honestly instead of guessing. Keep spoken answers concise — 2-4 sentences — since this is a voice conversation, and offer to go deeper if the user wants more detail."*
> 6. On session start, have the agent greet the user by the uploaded filename (from room metadata) and ask what they'd like to know (`session.generate_reply(instructions=...)`).
> 7. Handle graceful shutdown/disconnect when the user leaves the room.

**Watch-out to flag:** Sarvam's own LiveKit integration guide is explicit that mixing their STT's built-in turn-taking with Silero VAD or the generic LiveKit turn-detector causes worse endpointing, not better — keep the pipeline Sarvam-native as described above rather than porting patterns from Groq/Deepgram-based examples you find online.

---

## Phase 5 — React Frontend

**Goal:** upload UI + live voice conversation UI.

Prompt:
> In `frontend/`, using React + `livekit-client` + `@livekit/components-react`:
> 1. **Upload screen**: drag-and-drop / file-picker for PDF → `POST /api/documents/upload` (multipart) → show a progress/polling spinner hitting `GET /api/documents/:id/status` until `ready`.
> 2. On `ready`, call `POST /api/sessions` with the `documentId`, get back `{ token, roomName, livekitUrl }`.
> 3. **Call screen**: use `LiveKitRoom` component from `@livekit/components-react`, connect with the token/url. Render:
>    - A mic mute/unmute button (`useLocalParticipant`)
>    - Live transcript panel: use the `useTranscriptions` hook from `@livekit/components-react` to subscribe to the agent's transcription text streams. **Don't use `RoomEvent.TranscriptionReceived`** — it's deprecated now that LiveKit delivers transcriptions via text streams, and the old event won't fire reliably for them
>    - A simple audio visualizer for when the agent is speaking (`useVoiceAssistant` hook / `BarVisualizer` from `@livekit/components-react` — it's built for exactly this use case)
>    - A "End call" button that disconnects and returns to upload screen
> 4. Basic error states: upload failure, processing failure (`status: failed`), mic permission denied, room connection failure.

---

## Phase 6 — Integration Pass

**Goal:** wire all three services together and validate the full happy path end-to-end.

Prompt:
> Do an end-to-end integration test manually:
> 1. Upload a real multi-page PDF through the frontend.
> 2. Confirm Postgres `documents` row flips to `ready` and Qdrant shows a new collection with the expected point count (roughly `total_chars / 1000` chunks).
> 3. Start a session, confirm the Python agent process logs show it received dispatch, joined the room, and parsed the correct `collection` from metadata.
> 4. Ask a question by voice that has a clear answer in page 1 of the PDF — confirm the agent calls `search_document`, retrieves the right chunk, and answers with a correct page citation.
> 5. Ask a question with no answer in the document — confirm the agent says it doesn't know rather than hallucinating.
> 6. Test interruption: start speaking while the agent is still talking, confirm Sarvam's STT-driven turn detection stops the agent's TTS.
> Fix whichever of the three services breaks first — most likely failure points are (a) HF embedding rate limits, (b) room metadata not propagating before the agent's entrypoint runs, (c) Sarvam STT language/model mismatch producing empty transcripts.

---

## Phase 7 — Testing & Hardening

Prompt:
> Add:
> - Backend: unit tests for the chunking function (verify overlap/size), integration test for the upload→ready flow using a small sample PDF fixture.
> - Add file-type/size validation errors as proper 4xx JSON responses, not silent failures.
> - Add a cleanup job (cron or manual endpoint) to delete a document's Qdrant collection + uploaded file + Postgres row when a user deletes a document.
> - Rate-limit the upload endpoint (e.g. `express-rate-limit`) to prevent abuse.
> - Add basic auth/session identity (even a simple anonymous session id in a cookie) so one user can't query another user's document collection by guessing a room name.

---

## Phase 8 — Deployment

Prompt:
> Containerize each service:
> - `backend/Dockerfile` — Node 20 slim image.
> - `agent/Dockerfile` — Python 3.11 slim, install `livekit-agents`, `livekit-plugins-sarvam`, `livekit-plugins-groq`, `qdrant-client` (pin versions in `requirements.txt`); note the agent needs to run as a persistent **worker process** (`python app/main.py dev` locally / `python app/main.py start` in prod), not a request-response server.
> - `frontend/` — build static assets, serve via any static host (Vercel/Netlify) or Nginx container.
> Use LiveKit Cloud in production (avoids self-hosting the media server); Postgres and Qdrant can be managed services (Neon/Supabase + Qdrant Cloud) to start, moving to self-hosted only once you have real load. Document all env vars needed per service in a top-level `DEPLOYMENT.md`.

---

## Open Decisions You Should Make Before Phase 1

1. **Groq LLM model** — `openai/gpt-oss-120b` (higher quality, ~more latency) vs `openai/gpt-oss-20b` (faster, good enough for straightforward Q&A). These replace `llama-3.3-70b-versatile`/`llama-3.1-8b-instant`, which Groq fully retired on Aug 16, 2026. For voice, latency matters a lot — consider starting with the smaller model.
2. **Sarvam language config** — decide whether the agent is English-only (`language`/`target_language_code: "en-IN"` on STT/TTS) or should auto-detect and respond in whichever of the 10+ supported Indian languages the user speaks (`language="unknown"` on STT). This also determines which `speaker` values are valid for `bulbul:v3` — check Sarvam's speaker list once you've decided.
3. **Multi-document sessions** — this plan assumes one PDF per conversation. If you want a user to upload several PDFs and ask cross-document questions, the collection design needs to change (e.g., one collection with a `documentId` payload filter instead of one collection per doc) — flag this now if it's a requirement, it changes Phase 2 and Phase 4.

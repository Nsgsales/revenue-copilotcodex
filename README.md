# Revenue Copilot

Personal AI copilot for revenue writing, outreach refinement, business decision support, and persistent thread memory.

## What it does

- Takes a draft, idea, or business question plus a goal
- Runs parallel first-pass generation with ChatGPT and Claude
- Uses Claude to judge and synthesize the best final version
- Supports one-round cross-review for second-pass improvements
- Stores threads, messages, runs, outputs, and attachments in hosted storage
- Lets you continue refining the current version instead of restarting

## Stack

- Next.js App Router for UI and API routes
- React for the client workspace
- Hosted Postgres for durable thread, run, and message storage
- Vercel Blob for durable uploads
- OpenAI SDK for ChatGPT generation
- Anthropic SDK for Claude generation, judging, synthesis, and refinement
- `pdf-parse` and `mammoth` for PDF and DOCX text extraction

## Core architecture

1. User creates or opens a thread.
2. User submits input text, goal, and optional files.
3. Files are uploaded to Vercel Blob and parsed when possible.
4. ChatGPT and Claude generate drafts in parallel.
5. Claude analyzes both drafts.
6. Claude synthesizes the final version plus explanation and confidence.
7. The run, outputs, and assistant message are saved to Postgres.
8. Refinement keeps working from the latest synthesized version.
9. Optional cross-review runs exactly once and writes updated feedback plus synthesis.

## Database schema

Implemented in hosted Postgres with these tables:

- `threads`
  - `id`, `title`, `goal`, `original_input`, `created_at`, `updated_at`
- `messages`
  - `id`, `thread_id`, `role`, `content`, `created_at`
- `generation_runs`
  - `id`, `thread_id`, `input_text`, `goal`, `created_at`
- `model_outputs`
  - `id`, `generation_run_id`, `model_name`, `version_name`, `rewritten_message`, `strengths`, `weakness`
- `synthesized_outputs`
  - `id`, `generation_run_id`, `final_version`, `why_this_works`, `confidence_score`, `confidence_reason`, `created_at`
- `cross_review_runs`
  - `id`, `generation_run_id`, `created_at`
- `cross_review_feedback`
  - `id`, `cross_review_run_id`, `model_name`, `agreement_level`, `better_points`, `weaker_points`, `revised_version`
- `file_attachments`
  - `id`, `thread_id`, `file_type`, `file_name`, `file_url`, `extracted_text`, `created_at`

## API endpoints

- `GET /api/threads`
  - List thread summaries for the sidebar.
- `POST /api/threads`
  - Create a new thread shell.
- `GET /api/threads/:threadId`
  - Load a full thread with messages, attachments, and runs.
- `POST /api/threads/:threadId/attachments`
  - Upload and parse files for a thread.
- `POST /api/threads/:threadId/generate`
  - Run the main generation, analysis, and synthesis flow.
- `POST /api/threads/:threadId/refine`
  - Refine the latest synthesized version using Claude.
- `POST /api/threads/:threadId/cross-review`
  - Run one round of AI cross-review and resynthesize.

## Frontend shape

- Sidebar with thread history and reopen behavior
- Main compose panel with:
  - large input box
  - goal selector
  - file upload
  - generate button
- Results area with:
  - final version
  - why this works
  - confidence score
  - second-pass button
  - expandable drafts and insights
- Refinement chat section backed by thread messages

## Prompt layers

- Generator prompt
  - rewrite input for the selected goal
  - return JSON with version, strengths, weakness
- Analysis prompt
  - Claude compares the two drafts on hook, clarity, persuasion, structure, CTA
- Synthesis prompt
  - Claude merges the best parts and assigns confidence
- Refinement prompt
  - Claude edits the current version rather than restarting
- Cross-review prompt
  - each model critiques the other once and may revise once

## Running locally

1. Copy `.env.example` to `.env.local`.
2. Add your OpenAI and Anthropic keys.
3. Add a hosted Postgres `POSTGRES_URL`.
4. Add `BLOB_READ_WRITE_TOKEN` from Vercel Blob.
5. Run `npm.cmd install`.
6. Start the app with `npm.cmd run dev`.
7. Open [http://localhost:3000](http://localhost:3000).

## GitHub + Vercel deployment

1. Create a new GitHub repo and push this project.
2. In Vercel, import the GitHub repo as a new project.
3. In the Vercel Marketplace, add a Postgres provider such as Neon.
4. Add a Vercel Blob store and copy its write token.
5. In Vercel Project Settings, add:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `POSTGRES_URL`
   - `BLOB_READ_WRITE_TOKEN`
   - optionally `OPENAI_MODEL` and `CLAUDE_MODEL`
6. Trigger a deployment. The app initializes its schema automatically on first request.
7. Optional for local development: run `vercel env pull` to sync Development variables into a local env file.

## Why this deployment shape

- Vercel Functions use a read-only filesystem except for temporary scratch space, so local SQLite and local uploads are not durable there.
- Vercel recommends object storage for writing files at runtime.
- Vercel routes new Postgres projects through Marketplace providers.

## Notes

- If AI API keys are missing, the app still falls back to deterministic mock outputs so the product flow remains testable.
- Hosted storage is now required even for local development, because the app is prepared for the same runtime model used in production.
- Uploaded files are stored in Blob using public URLs in this V1 implementation, so avoid uploading sensitive documents until private storage or signed access is added.
- Image uploads are stored and threaded, but V1 does not perform OCR.

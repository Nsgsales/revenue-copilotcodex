import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type {
  ConfidenceScore,
  CrossReviewFeedback,
  CrossReviewFeedbackRecord,
  FileAttachmentRecord,
  GenerationRunDetail,
  MessageRecord,
  ModelOutputRecord,
  SynthesizedOutputRecord,
  ThreadDetail,
  ThreadRecord
} from "@/lib/types";

type DbRow = Record<string, unknown>;

let sqlClient: postgres.Sql | null = null;
let initPromise: Promise<void> | null = null;

function now() {
  return new Date().toISOString();
}

function requirePostgresUrl() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required. Add a hosted Postgres database before running the app.");
  }

  return connectionString;
}

function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  sqlClient = postgres(requirePostgresUrl(), {
    ssl: process.env.POSTGRES_SSL === "disable" ? false : "require",
    prepare: false
  });

  return sqlClient;
}

async function ensureDb() {
  if (initPromise) {
    return initPromise;
  }

  const sql = getSql();
  initPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        original_input TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS generation_runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        input_text TEXT NOT NULL,
        goal TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS model_outputs (
        id TEXT PRIMARY KEY,
        generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
        model_name TEXT NOT NULL,
        version_name TEXT NOT NULL,
        rewritten_message TEXT NOT NULL,
        strengths JSONB NOT NULL,
        weakness TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS synthesized_outputs (
        id TEXT PRIMARY KEY,
        generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
        final_version TEXT NOT NULL,
        why_this_works TEXT NOT NULL,
        confidence_score TEXT NOT NULL,
        confidence_reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS cross_review_runs (
        id TEXT PRIMARY KEY,
        generation_run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS cross_review_feedback (
        id TEXT PRIMARY KEY,
        cross_review_run_id TEXT NOT NULL REFERENCES cross_review_runs(id) ON DELETE CASCADE,
        model_name TEXT NOT NULL,
        agreement_level TEXT NOT NULL,
        better_points JSONB NOT NULL,
        weaker_points JSONB NOT NULL,
        revised_version TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS file_attachments (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        file_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        extracted_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS generation_runs_thread_idx ON generation_runs(thread_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS model_outputs_run_idx ON model_outputs(generation_run_id)`;
    await sql`CREATE INDEX IF NOT EXISTS synth_outputs_run_idx ON synthesized_outputs(generation_run_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS cross_review_runs_gen_idx ON cross_review_runs(generation_run_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS cross_review_feedback_run_idx ON cross_review_feedback(cross_review_run_id)`;
    await sql`CREATE INDEX IF NOT EXISTS attachments_thread_idx ON file_attachments(thread_id, created_at)`;
  })();

  return initPromise;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapThread(row: DbRow): ThreadRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    goal: String(row.goal),
    original_input: String(row.original_input),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString()
  };
}

function mapMessage(row: DbRow): MessageRecord {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    role: row.role as MessageRecord["role"],
    content: String(row.content),
    created_at: new Date(String(row.created_at)).toISOString()
  };
}

function mapAttachment(row: DbRow): FileAttachmentRecord {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    file_type: String(row.file_type),
    file_name: String(row.file_name),
    file_url: String(row.file_url),
    extracted_text: String(row.extracted_text),
    created_at: new Date(String(row.created_at)).toISOString()
  };
}

function mapModelOutput(row: DbRow): ModelOutputRecord {
  return {
    id: String(row.id),
    generation_run_id: String(row.generation_run_id),
    model_name: String(row.model_name),
    version_name: String(row.version_name),
    rewritten_message: String(row.rewritten_message),
    strengths: parseStringArray(row.strengths),
    weakness: String(row.weakness)
  };
}

function mapSynthesizedOutput(row: DbRow): SynthesizedOutputRecord {
  return {
    id: String(row.id),
    generation_run_id: String(row.generation_run_id),
    final_version: String(row.final_version),
    why_this_works: String(row.why_this_works),
    confidence_score: row.confidence_score as ConfidenceScore,
    confidence_reason: String(row.confidence_reason)
  };
}

function mapCrossReviewFeedback(row: DbRow): CrossReviewFeedbackRecord {
  return {
    id: String(row.id),
    cross_review_run_id: String(row.cross_review_run_id),
    model_name: String(row.model_name),
    agreement_level: String(row.agreement_level),
    better_points: parseStringArray(row.better_points),
    weaker_points: parseStringArray(row.weaker_points),
    revised_version: String(row.revised_version)
  };
}

export async function listThreads(): Promise<ThreadRecord[]> {
  await ensureDb();
  const sql = getSql();
  const rows = await sql`SELECT * FROM threads ORDER BY updated_at DESC`;
  return rows.map((row) => mapThread(row as DbRow));
}

export async function getThread(threadId: string): Promise<ThreadDetail | null> {
  await ensureDb();
  const sql = getSql();

  const threadRows = await sql`SELECT * FROM threads WHERE id = ${threadId}`;
  if (!threadRows.length) {
    return null;
  }

  const [messageRows, attachmentRows, generationRows] = await Promise.all([
    sql`SELECT * FROM messages WHERE thread_id = ${threadId} ORDER BY created_at ASC`,
    sql`SELECT * FROM file_attachments WHERE thread_id = ${threadId} ORDER BY created_at ASC`,
    sql`SELECT * FROM generation_runs WHERE thread_id = ${threadId} ORDER BY created_at DESC`
  ]);

  const detailedRuns = await Promise.all(
    generationRows.map(async (runRow) => {
      const runId = String((runRow as DbRow).id);

      const [modelRows, synthesisRows, crossReviewRows] = await Promise.all([
        sql`SELECT * FROM model_outputs WHERE generation_run_id = ${runId} ORDER BY model_name ASC`,
        sql`SELECT * FROM synthesized_outputs WHERE generation_run_id = ${runId} ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT * FROM cross_review_runs WHERE generation_run_id = ${runId} ORDER BY created_at DESC LIMIT 1`
      ]);

      const crossReviewRun = crossReviewRows[0] as DbRow | undefined;
      const crossReviewFeedbackRows = crossReviewRun
        ? await sql`SELECT * FROM cross_review_feedback WHERE cross_review_run_id = ${String(crossReviewRun.id)} ORDER BY model_name ASC`
        : [];

      return {
        id: runId,
        thread_id: String((runRow as DbRow).thread_id),
        input_text: String((runRow as DbRow).input_text),
        goal: String((runRow as DbRow).goal),
        created_at: new Date(String((runRow as DbRow).created_at)).toISOString(),
        modelOutputs: modelRows.map((row) => mapModelOutput(row as DbRow)),
        synthesizedOutput: synthesisRows[0] ? mapSynthesizedOutput(synthesisRows[0] as DbRow) : null,
        crossReviewRunId: crossReviewRun ? String(crossReviewRun.id) : null,
        crossReviewFeedback: crossReviewFeedbackRows.map((row) => mapCrossReviewFeedback(row as DbRow))
      } satisfies GenerationRunDetail;
    })
  );

  return {
    thread: mapThread(threadRows[0] as DbRow),
    messages: messageRows.map((row) => mapMessage(row as DbRow)),
    attachments: attachmentRows.map((row) => mapAttachment(row as DbRow)),
    generationRuns: detailedRuns
  };
}

export async function createThread(data: {
  title: string;
  goal: string;
  originalInput: string;
}): Promise<ThreadRecord> {
  await ensureDb();
  const sql = getSql();
  const record: ThreadRecord = {
    id: randomUUID(),
    title: data.title,
    goal: data.goal,
    original_input: data.originalInput,
    created_at: now(),
    updated_at: now()
  };

  await sql`
    INSERT INTO threads (id, title, goal, original_input, created_at, updated_at)
    VALUES (${record.id}, ${record.title}, ${record.goal}, ${record.original_input}, ${record.created_at}, ${record.updated_at})
  `;

  return record;
}

export async function touchThread(threadId: string) {
  await ensureDb();
  const sql = getSql();
  await sql`UPDATE threads SET updated_at = ${now()} WHERE id = ${threadId}`;
}

export async function updateThreadTitle(threadId: string, title: string) {
  await ensureDb();
  const sql = getSql();
  await sql`UPDATE threads SET title = ${title}, updated_at = ${now()} WHERE id = ${threadId}`;
}

export async function addMessage(data: {
  threadId: string;
  role: MessageRecord["role"];
  content: string;
}): Promise<MessageRecord> {
  await ensureDb();
  const sql = getSql();
  const record: MessageRecord = {
    id: randomUUID(),
    thread_id: data.threadId,
    role: data.role,
    content: data.content,
    created_at: now()
  };

  await sql`
    INSERT INTO messages (id, thread_id, role, content, created_at)
    VALUES (${record.id}, ${record.thread_id}, ${record.role}, ${record.content}, ${record.created_at})
  `;
  await touchThread(data.threadId);
  return record;
}

export async function createGenerationRun(data: {
  threadId: string;
  inputText: string;
  goal: string;
}) {
  await ensureDb();
  const sql = getSql();
  const record = {
    id: randomUUID(),
    thread_id: data.threadId,
    input_text: data.inputText,
    goal: data.goal,
    created_at: now()
  };

  await sql`
    INSERT INTO generation_runs (id, thread_id, input_text, goal, created_at)
    VALUES (${record.id}, ${record.thread_id}, ${record.input_text}, ${record.goal}, ${record.created_at})
  `;
  await touchThread(data.threadId);
  return record;
}

export async function saveModelOutput(data: {
  generationRunId: string;
  modelName: string;
  versionName: string;
  rewrittenMessage: string;
  strengths: string[];
  weakness: string;
}): Promise<ModelOutputRecord> {
  await ensureDb();
  const sql = getSql();
  const record: ModelOutputRecord = {
    id: randomUUID(),
    generation_run_id: data.generationRunId,
    model_name: data.modelName,
    version_name: data.versionName,
    rewritten_message: data.rewrittenMessage,
    strengths: data.strengths,
    weakness: data.weakness
  };

  await sql`
    INSERT INTO model_outputs (id, generation_run_id, model_name, version_name, rewritten_message, strengths, weakness)
    VALUES (${record.id}, ${record.generation_run_id}, ${record.model_name}, ${record.version_name}, ${record.rewritten_message}, ${sql.json(record.strengths)}, ${record.weakness})
  `;

  return record;
}

export async function saveSynthesizedOutput(data: {
  generationRunId: string;
  finalVersion: string;
  whyThisWorks: string;
  confidenceScore: ConfidenceScore;
  confidenceReason: string;
}): Promise<SynthesizedOutputRecord> {
  await ensureDb();
  const sql = getSql();
  const record: SynthesizedOutputRecord = {
    id: randomUUID(),
    generation_run_id: data.generationRunId,
    final_version: data.finalVersion,
    why_this_works: data.whyThisWorks,
    confidence_score: data.confidenceScore,
    confidence_reason: data.confidenceReason
  };

  await sql`
    INSERT INTO synthesized_outputs (id, generation_run_id, final_version, why_this_works, confidence_score, confidence_reason)
    VALUES (${record.id}, ${record.generation_run_id}, ${record.final_version}, ${record.why_this_works}, ${record.confidence_score}, ${record.confidence_reason})
  `;

  return record;
}

export async function saveCrossReviewRun(generationRunId: string): Promise<{ id: string; generation_run_id: string }> {
  await ensureDb();
  const sql = getSql();
  const record = {
    id: randomUUID(),
    generation_run_id: generationRunId
  };

  await sql`
    INSERT INTO cross_review_runs (id, generation_run_id)
    VALUES (${record.id}, ${record.generation_run_id})
  `;

  return record;
}

export async function saveCrossReviewFeedback(data: {
  crossReviewRunId: string;
  modelName: string;
  feedback: CrossReviewFeedback;
}): Promise<CrossReviewFeedbackRecord> {
  await ensureDb();
  const sql = getSql();
  const record: CrossReviewFeedbackRecord = {
    id: randomUUID(),
    cross_review_run_id: data.crossReviewRunId,
    model_name: data.modelName,
    agreement_level: data.feedback.agreementLevel,
    better_points: data.feedback.betterPoints,
    weaker_points: data.feedback.weakerPoints,
    revised_version: data.feedback.revisedVersion
  };

  await sql`
    INSERT INTO cross_review_feedback (id, cross_review_run_id, model_name, agreement_level, better_points, weaker_points, revised_version)
    VALUES (${record.id}, ${record.cross_review_run_id}, ${record.model_name}, ${record.agreement_level}, ${sql.json(record.better_points)}, ${sql.json(record.weaker_points)}, ${record.revised_version})
  `;

  return record;
}

export async function saveAttachment(data: {
  threadId: string;
  fileType: string;
  fileName: string;
  fileUrl: string;
  extractedText: string;
}): Promise<FileAttachmentRecord> {
  await ensureDb();
  const sql = getSql();
  const record: FileAttachmentRecord = {
    id: randomUUID(),
    thread_id: data.threadId,
    file_type: data.fileType,
    file_name: data.fileName,
    file_url: data.fileUrl,
    extracted_text: data.extractedText,
    created_at: now()
  };

  await sql`
    INSERT INTO file_attachments (id, thread_id, file_type, file_name, file_url, extracted_text, created_at)
    VALUES (${record.id}, ${record.thread_id}, ${record.file_type}, ${record.file_name}, ${record.file_url}, ${record.extracted_text}, ${record.created_at})
  `;

  await touchThread(data.threadId);
  return record;
}

export async function latestGenerationRun(threadId: string): Promise<GenerationRunDetail | null> {
  const detail = await getThread(threadId);
  return detail?.generationRuns[0] ?? null;
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import styles from "@/components/app-shell.module.css";
import type { FileAttachmentRecord, GoalOption, ThreadDetail, ThreadRecord } from "@/lib/types";
import { summarizeMessage } from "@/lib/utils";

const goalOptions: GoalOption[] = ["Conversion", "Replies", "Tone", "Clarity", "Persuasion", "Decision"];

type Props = {
  initialThreads: ThreadRecord[];
};

type Status = "idle" | "saving" | "generating" | "refining" | "reviewing";

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return parsed as T;
}

export function AppShell({ initialThreads }: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [goal, setGoal] = useState<string>(initialThreads[0]?.goal ?? "Conversion");
  const [inputText, setInputText] = useState("");
  const [refineText, setRefineText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetail(null);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/threads/${selectedThreadId}`);
        const detail = await readJsonOrThrow<ThreadDetail>(response);
        setThreadDetail(detail);
        setGoal(detail.thread.goal);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Failed to load thread");
      }
    });
  }, [selectedThreadId]);

  const latestRun = threadDetail?.generationRuns[0] ?? null;
  const latestOutput = latestRun?.synthesizedOutput ?? null;

  const draftLookup = useMemo(() => {
    const outputs = latestRun?.modelOutputs ?? [];
    return {
      chatgpt: outputs.find((draft) => draft.model_name === "chatgpt") ?? null,
      claude: outputs.find((draft) => draft.model_name === "claude") ?? null
    };
  }, [latestRun]);

  async function refreshThreads(selectedId?: string) {
    const response = await fetch("/api/threads");
    const data = await readJsonOrThrow<{ threads: ThreadRecord[] }>(response);
    setThreads(data.threads);
    if (selectedId) {
      setSelectedThreadId(selectedId);
    }
  }

  async function ensureThread() {
    if (selectedThreadId) {
      return selectedThreadId;
    }

    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        goal,
        originalInput: inputText
      })
    });

    const data = await readJsonOrThrow<{ thread: ThreadRecord; detail: ThreadDetail }>(response);
    setSelectedThreadId(data.thread.id);
    setThreadDetail(data.detail);
    await refreshThreads(data.thread.id);
    return data.thread.id;
  }

  async function uploadFiles(threadId: string) {
    if (!pendingFiles.length) {
      return [] as FileAttachmentRecord[];
    }

    const formData = new FormData();
    for (const file of pendingFiles) {
      formData.append("files", file);
    }

    const response = await fetch(`/api/threads/${threadId}/attachments`, {
      method: "POST",
      body: formData
    });

    const data = await readJsonOrThrow<{ attachments: FileAttachmentRecord[] }>(response);
    setPendingFiles([]);
    return data.attachments;
  }

  async function handleGenerate() {
    if (!inputText.trim()) {
      setError("Add your draft, message, or decision before generating.");
      return;
    }

    setError(null);
    setStatus("saving");

    try {
      const threadId = await ensureThread();
      await uploadFiles(threadId);

      setStatus("generating");
      const response = await fetch(`/api/threads/${threadId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText, goal })
      });

      const detail = await readJsonOrThrow<ThreadDetail>(response);
      setThreadDetail(detail);
      setInputText("");
      await refreshThreads(threadId);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Generation failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleRefine() {
    if (!selectedThreadId || !refineText.trim()) {
      return;
    }

    setStatus("refining");
    setError(null);

    try {
      const response = await fetch(`/api/threads/${selectedThreadId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: refineText })
      });

      const detail = await readJsonOrThrow<ThreadDetail>(response);
      setThreadDetail(detail);
      setRefineText("");
      await refreshThreads(selectedThreadId);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Refinement failed");
    } finally {
      setStatus("idle");
    }
  }

  async function handleCrossReview() {
    if (!selectedThreadId) {
      return;
    }

    setStatus("reviewing");
    setError(null);

    try {
      const response = await fetch(`/api/threads/${selectedThreadId}/cross-review`, {
        method: "POST"
      });

      const detail = await readJsonOrThrow<ThreadDetail>(response);
      setThreadDetail(detail);
      await refreshThreads(selectedThreadId);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Second pass failed");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>Revenue Copilot</p>
          <h1>Your daily writing and decision layer</h1>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setSelectedThreadId(null);
              setThreadDetail(null);
              setInputText("");
              setRefineText("");
              setGoal("Conversion");
            }}
          >
            New thread
          </button>
        </div>

        <div className={styles.threadList}>
          {threads.length === 0 ? <p className={styles.emptyState}>No threads yet. Your first run will create one automatically.</p> : null}
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={thread.id === selectedThreadId ? styles.threadCardActive : styles.threadCard}
              onClick={() => setSelectedThreadId(thread.id)}
            >
              <strong>{thread.title}</strong>
              <span>{thread.goal}</span>
              <small>{new Date(thread.updated_at).toLocaleString()}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className={styles.mainColumn}>
        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Main workspace</p>
            <h2>Write once, get the strongest version fast</h2>
            <p className={styles.heroCopy}>
              ChatGPT and Claude generate in parallel. Claude judges, synthesizes, and keeps the refinement thread moving without restarting the work.
            </p>
          </div>
          <div className={styles.statusBadge}>
            <span>Status</span>
            <strong>{status === "idle" ? "Ready" : status}</strong>
          </div>
        </div>

        <div className={styles.composeCard}>
          <div className={styles.controls}>
            <label className={styles.controlLabel}>
              Goal
              <select value={goal} onChange={(event) => setGoal(event.target.value)}>
                {goalOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.uploadLabel}>
              Attach files
              <input
                type="file"
                multiple
                onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>

          <textarea
            className={styles.input}
            placeholder="Paste an email, outreach draft, sales message, idea, or business decision here."
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
          />

          <div className={styles.pendingRow}>
            <div>
              {pendingFiles.length > 0 ? pendingFiles.map((file) => <span key={file.name} className={styles.filePill}>{file.name}</span>) : <span className={styles.muted}>No new files attached</span>}
            </div>
            <button className={styles.primaryButton} onClick={handleGenerate} disabled={status !== "idle"}>
              {status === "generating" || status === "saving" ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        <div className={styles.resultsGrid}>
          <section className={styles.primaryPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Final Version</p>
                <h3>{threadDetail?.thread.title ?? "No thread selected"}</h3>
              </div>
              <button
                className={styles.secondaryButton}
                onClick={handleCrossReview}
                disabled={!latestRun || status !== "idle"}
              >
                Run second pass
              </button>
            </div>

            <pre className={styles.finalCopy}>{latestOutput?.final_version ?? "Your final version will appear here after generation."}</pre>

            <div className={styles.insightGrid}>
              <div className={styles.insightCard}>
                <span>Why this works</span>
                <p>{latestOutput?.why_this_works ?? "A short synthesis explanation will appear here."}</p>
              </div>
              <div className={styles.insightCard}>
                <span>Confidence</span>
                <p>
                  <strong>{latestOutput?.confidence_score ?? "—"}</strong>
                  {latestOutput?.confidence_reason ? ` · ${latestOutput.confidence_reason}` : ""}
                </p>
              </div>
            </div>
          </section>

          <section className={styles.sidePanel}>
            <details className={styles.expandable} open>
              <summary>View drafts</summary>
              <div className={styles.draftBlock}>
                <strong>ChatGPT</strong>
                <p>{draftLookup.chatgpt?.version_name ?? "No draft yet"}</p>
                <pre>{draftLookup.chatgpt?.rewritten_message ?? ""}</pre>
              </div>
              <div className={styles.draftBlock}>
                <strong>Claude</strong>
                <p>{draftLookup.claude?.version_name ?? "No draft yet"}</p>
                <pre>{draftLookup.claude?.rewritten_message ?? ""}</pre>
              </div>
            </details>

            <details className={styles.expandable}>
              <summary>Comparison insights</summary>
              <div className={styles.metaList}>
                <p>{latestRun?.crossReviewFeedback.length ? "A second-pass review was stored for this run." : "Initial comparison is folded into synthesis for speed in V1."}</p>
                {draftLookup.chatgpt?.strengths.map((item) => (
                  <span key={`chatgpt-${item}`} className={styles.metaPill}>ChatGPT: {item}</span>
                ))}
                {draftLookup.claude?.strengths.map((item) => (
                  <span key={`claude-${item}`} className={styles.metaPill}>Claude: {item}</span>
                ))}
              </div>
            </details>

            <div className={styles.attachmentsCard}>
              <p className={styles.eyebrow}>Thread memory</p>
              <h4>Files and recent context</h4>
              <div className={styles.metaList}>
                {(threadDetail?.attachments ?? []).map((file) => (
                  <span key={file.id} className={styles.metaPill}>
                    {file.file_name}
                  </span>
                ))}
                {!threadDetail?.attachments.length ? <p className={styles.muted}>No saved attachments on this thread yet.</p> : null}
              </div>
            </div>
          </section>
        </div>

        <section className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Refinement chat</p>
              <h3>Keep iterating on the current version</h3>
            </div>
          </div>

          <div className={styles.messageList}>
            {(threadDetail?.messages ?? []).map((message) => (
              <div key={message.id} className={message.role === "assistant" ? styles.assistantMessage : styles.userMessage}>
                <span>{message.role}</span>
                <p>{summarizeMessage(message.content)}</p>
              </div>
            ))}
            {!threadDetail?.messages.length ? <p className={styles.muted}>Your thread history will accumulate here.</p> : null}
          </div>

          <div className={styles.refineBox}>
            <textarea
              className={styles.refineInput}
              placeholder="Make it shorter, more assertive, more casual, more premium, or sharper on the CTA."
              value={refineText}
              onChange={(event) => setRefineText(event.target.value)}
            />
            <button className={styles.primaryButton} onClick={handleRefine} disabled={!selectedThreadId || status !== "idle" || isPending}>
              {status === "refining" ? "Refining..." : "Refine current version"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

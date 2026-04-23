import { NextResponse } from "next/server";
import { runCrossReview, synthesizeCrossReview } from "@/lib/ai";
import {
  addMessage,
  getThread,
  latestGenerationRun,
  saveCrossReviewFeedback,
  saveCrossReviewRun,
  saveSynthesizedOutput
} from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await context.params;
  const detail = await getThread(threadId);
  const run = await latestGenerationRun(threadId);

  if (!detail || !run) {
    return NextResponse.json({ error: "Nothing to review yet" }, { status: 404 });
  }

  const chatgptOutput = run.modelOutputs.find((output) => output.model_name === "chatgpt");
  const claudeOutput = run.modelOutputs.find((output) => output.model_name === "claude");

  if (!chatgptOutput || !claudeOutput) {
    return NextResponse.json({ error: "Cross-review requires both initial drafts" }, { status: 400 });
  }

  const review = await runCrossReview({
    inputText: run.input_text,
    goal: run.goal,
    chatgpt: {
      versionName: chatgptOutput.version_name,
      rewrittenMessage: chatgptOutput.rewritten_message,
      strengths: chatgptOutput.strengths,
      weakness: chatgptOutput.weakness
    },
    claude: {
      versionName: claudeOutput.version_name,
      rewrittenMessage: claudeOutput.rewritten_message,
      strengths: claudeOutput.strengths,
      weakness: claudeOutput.weakness
    }
  });

  const crossReviewRun = await saveCrossReviewRun(run.id);
  await saveCrossReviewFeedback({
    crossReviewRunId: crossReviewRun.id,
    modelName: "chatgpt",
    feedback: review.chatgptReview
  });
  await saveCrossReviewFeedback({
    crossReviewRunId: crossReviewRun.id,
    modelName: "claude",
    feedback: review.claudeReview
  });

  const updated = await synthesizeCrossReview({
    inputText: run.input_text,
    goal: run.goal,
    chatgptReview: review.chatgptReview,
    claudeReview: review.claudeReview
  });

  await saveSynthesizedOutput({
    generationRunId: run.id,
    finalVersion: updated.synthesis.finalVersion,
    whyThisWorks: `${updated.synthesis.whyThisWorks}\n\nSecond-pass improvement: the revised drafts were compared once, then recombined into a cleaner final answer.`,
    confidenceScore: updated.synthesis.confidenceScore,
    confidenceReason: updated.synthesis.confidenceReason
  });

  await addMessage({ threadId, role: "assistant", content: updated.synthesis.finalVersion });

  return NextResponse.json(await getThread(threadId));
}

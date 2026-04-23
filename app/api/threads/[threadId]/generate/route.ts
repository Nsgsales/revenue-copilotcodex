import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeDrafts, generateDrafts, synthesizeDrafts } from "@/lib/ai";
import {
  addMessage,
  createGenerationRun,
  getThread,
  saveModelOutput,
  saveSynthesizedOutput,
  updateThreadTitle
} from "@/lib/db";
import { makeThreadTitle } from "@/lib/utils";

const schema = z.object({
  inputText: z.string().min(1),
  goal: z.string().min(1)
});

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await context.params;
  const existing = await getThread(threadId);

  if (!existing) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const body = schema.parse(await request.json());
  await updateThreadTitle(threadId, makeThreadTitle(body.inputText, body.goal));
  await addMessage({ threadId, role: "user", content: body.inputText });

  const generationRun = await createGenerationRun({
    threadId,
    inputText: body.inputText,
    goal: body.goal
  });

  const drafts = await generateDrafts({
    inputText: body.inputText,
    goal: body.goal,
    attachments: existing.attachments
  });

  await saveModelOutput({
    generationRunId: generationRun.id,
    modelName: "chatgpt",
    versionName: drafts.chatgpt.versionName,
    rewrittenMessage: drafts.chatgpt.rewrittenMessage,
    strengths: drafts.chatgpt.strengths,
    weakness: drafts.chatgpt.weakness
  });

  await saveModelOutput({
    generationRunId: generationRun.id,
    modelName: "claude",
    versionName: drafts.claude.versionName,
    rewrittenMessage: drafts.claude.rewrittenMessage,
    strengths: drafts.claude.strengths,
    weakness: drafts.claude.weakness
  });

  const analysis = await analyzeDrafts({
    inputText: body.inputText,
    goal: body.goal,
    chatgpt: drafts.chatgpt,
    claude: drafts.claude
  });

  const synthesis = await synthesizeDrafts({
    inputText: body.inputText,
    goal: body.goal,
    chatgpt: drafts.chatgpt,
    claude: drafts.claude,
    analysis
  });

  await saveSynthesizedOutput({
    generationRunId: generationRun.id,
    finalVersion: synthesis.finalVersion,
    whyThisWorks: synthesis.whyThisWorks,
    confidenceScore: synthesis.confidenceScore,
    confidenceReason: synthesis.confidenceReason
  });

  await addMessage({ threadId, role: "assistant", content: synthesis.finalVersion });

  return NextResponse.json(await getThread(threadId));
}

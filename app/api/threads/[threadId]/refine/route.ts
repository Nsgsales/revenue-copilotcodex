import { NextResponse } from "next/server";
import { z } from "zod";
import { refineVersion } from "@/lib/ai";
import { addMessage, createGenerationRun, getThread, saveSynthesizedOutput } from "@/lib/db";

const schema = z.object({
  instruction: z.string().min(1)
});

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await context.params;
    const detail = await getThread(threadId);

    if (!detail) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const body = schema.parse(await request.json());
    const latestRun = detail.generationRuns[0];
    const currentVersion = latestRun?.synthesizedOutput?.final_version ?? detail.thread.original_input;

    await addMessage({ threadId, role: "user", content: body.instruction });

    const refinement = await refineVersion({
      currentVersion,
      instruction: body.instruction,
      goal: detail.thread.goal,
      attachments: detail.attachments
    });

    const run = await createGenerationRun({
      threadId,
      inputText: currentVersion,
      goal: detail.thread.goal
    });

    await saveSynthesizedOutput({
      generationRunId: run.id,
      finalVersion: refinement.finalVersion,
      whyThisWorks: refinement.whyThisWorks,
      confidenceScore: refinement.confidenceScore,
      confidenceReason: refinement.confidenceReason
    });

    await addMessage({ threadId, role: "assistant", content: refinement.finalVersion });

    return NextResponse.json(await getThread(threadId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refinement failed" },
      { status: 500 }
    );
  }
}

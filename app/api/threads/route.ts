import { NextResponse } from "next/server";
import { createThread, getThread, listThreads } from "@/lib/db";
import { makeThreadTitle } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ threads: await listThreads() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load threads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : makeThreadTitle(body.originalInput ?? "", body.goal ?? "Revenue");
    const thread = await createThread({
      title,
      goal: body.goal ?? "Conversion",
      originalInput: body.originalInput ?? ""
    });

    return NextResponse.json({ thread, detail: await getThread(thread.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create thread" },
      { status: 500 }
    );
  }
}

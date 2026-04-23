import { NextResponse } from "next/server";
import { createThread, getThread, listThreads } from "@/lib/db";
import { makeThreadTitle } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ threads: await listThreads() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : makeThreadTitle(body.originalInput ?? "", body.goal ?? "Revenue");
  const thread = await createThread({
    title,
    goal: body.goal ?? "Conversion",
    originalInput: body.originalInput ?? ""
  });

  return NextResponse.json({ thread, detail: await getThread(thread.id) });
}

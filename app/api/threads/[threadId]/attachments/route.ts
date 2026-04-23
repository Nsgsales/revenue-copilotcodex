import { NextResponse } from "next/server";
import { getThread, saveAttachment } from "@/lib/db";
import { persistUpload } from "@/lib/files";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await context.params;
    const existing = await getThread(threadId);

    if (!existing) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const uploads = formData.getAll("files").filter((value): value is File => value instanceof File);

    const saved = [];
    for (const file of uploads) {
      const persisted = await persistUpload(threadId, file);
      saved.push(
        await saveAttachment({
          threadId,
          fileType: persisted.fileType,
          fileName: persisted.fileName,
          fileUrl: persisted.fileUrl,
          extractedText: persisted.extractedText
        })
      );
    }

    return NextResponse.json({ attachments: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File upload failed" },
      { status: 500 }
    );
  }
}

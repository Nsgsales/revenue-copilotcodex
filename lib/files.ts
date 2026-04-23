import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function requireBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required. Add Vercel Blob before uploading files.");
  }
}

export async function persistUpload(threadId: string, file: File) {
  requireBlobToken();

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name);
  const storedName = `${threadId}/${randomUUID()}-${safeName(file.name || `upload${extension}`)}`;

  const blob = await put(storedName, buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type || "application/octet-stream"
  });

  const extractedText = await extractText(file.name, file.type, buffer);

  return {
    fileType: file.type || "application/octet-stream",
    fileName: file.name,
    fileUrl: blob.url,
    extractedText
  };
}

async function extractText(fileName: string, mimeType: string, buffer: Buffer) {
  const extension = path.extname(fileName).toLowerCase();

  if (mimeType.startsWith("text/") || [".md", ".txt", ".json", ".csv", ".tsv"].includes(extension)) {
    return buffer.toString("utf8").slice(0, 20000);
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    try {
      const parsed = await pdfParse(buffer);
      return parsed.text.slice(0, 20000);
    } catch {
      return "PDF uploaded, but text extraction failed. Use the filename and file type as context.";
    }
  }

  if (
    extension === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const extracted = await mammoth.extractRawText({ buffer });
      return extracted.value.slice(0, 20000);
    } catch {
      return "DOCX uploaded, but text extraction failed. Use the filename and file type as context.";
    }
  }

  if (mimeType.startsWith("image/")) {
    return `Image uploaded: ${fileName}. No OCR in V1, but the file is attached to the thread for future context.`;
  }

  return `File uploaded: ${fileName}. No parser available for this file type in V1.`;
}

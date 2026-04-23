import { listThreads } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const threads = await listThreads().catch(() => []);
  return <AppShell initialThreads={threads} />;
}

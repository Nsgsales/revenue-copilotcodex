import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Revenue Copilot",
  description: "Personal AI copilot for revenue writing, outreach, and decision-making."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

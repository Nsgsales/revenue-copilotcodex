import type {
  AnalysisResult,
  CrossReviewFeedback,
  GeneratorResult,
  SynthesisResult
} from "@/lib/types";

function attachmentSummary(attachments: { file_name: string; extracted_text: string }[]) {
  if (!attachments.length) {
    return "No file attachments.";
  }

  return attachments
    .map((file, index) => {
      const body = file.extracted_text.trim() || "No extractable text. Use file type and filename as context only.";
      return `Attachment ${index + 1}: ${file.file_name}\n${body.slice(0, 4000)}`;
    })
    .join("\n\n");
}

export function generatorPrompt(args: {
  modelLabel: string;
  inputText: string;
  goal: string;
  attachments: { file_name: string; extracted_text: string }[];
}) {
  return `
You are ${args.modelLabel} inside a personal Revenue Copilot.

Task:
- Rewrite or improve the user's message for the stated goal.
- Be decisive and improve aggressively when needed.
- Keep the result practical and usable right away.

Goal: ${args.goal}

User input:
${args.inputText}

Supporting context:
${attachmentSummary(args.attachments)}

Return strict JSON with this shape:
{
  "versionName": "short label",
  "rewrittenMessage": "full rewritten message",
  "strengths": ["point 1", "point 2", "point 3"],
  "weakness": "single biggest weakness"
}
`.trim();
}

export function analysisPrompt(args: {
  inputText: string;
  goal: string;
  chatgpt: GeneratorResult;
  claude: GeneratorResult;
}) {
  return `
You are Claude acting as the judge for a Revenue Copilot.
Compare the two drafts below against the user's goal.

Goal: ${args.goal}
Original input:
${args.inputText}

ChatGPT draft:
${JSON.stringify(args.chatgpt, null, 2)}

Claude draft:
${JSON.stringify(args.claude, null, 2)}

Score them on:
- hook
- clarity
- persuasion
- structure
- CTA

Return strict JSON:
{
  "winner": "chatgpt" | "claude" | "tie",
  "hook": "short comparison",
  "clarity": "short comparison",
  "persuasion": "short comparison",
  "structure": "short comparison",
  "cta": "short comparison",
  "bestElements": ["best element 1", "best element 2", "best element 3"]
}
`.trim();
}

export function synthesisPrompt(args: {
  goal: string;
  inputText: string;
  analysis: AnalysisResult;
  chatgpt: GeneratorResult;
  claude: GeneratorResult;
}) {
  return `
You are Claude synthesizing the best final answer for a Revenue Copilot.

Goal: ${args.goal}
Original input:
${args.inputText}

Analysis:
${JSON.stringify(args.analysis, null, 2)}

ChatGPT draft:
${JSON.stringify(args.chatgpt, null, 2)}

Claude draft:
${JSON.stringify(args.claude, null, 2)}

Confidence rules:
- High: both drafts are strong and aligned, with a clear CTA
- Medium: drafts differ but synthesis is solid
- Low: weak drafts or unclear input

Return strict JSON:
{
  "finalVersion": "best final message",
  "whyThisWorks": "2-4 sentence explanation",
  "confidenceScore": "High" | "Medium" | "Low",
  "confidenceReason": "1-2 sentence reason"
}
`.trim();
}

export function refinementPrompt(args: {
  currentVersion: string;
  instruction: string;
  goal: string;
  attachments: { file_name: string; extracted_text: string }[];
}) {
  return `
You are Claude refining an existing revenue message.
Do not restart from scratch unless the user explicitly asks to.
Preserve the strongest parts of the current version while applying the new direction.

Goal: ${args.goal}
Current version:
${args.currentVersion}

Refinement request:
${args.instruction}

Supporting context:
${attachmentSummary(args.attachments)}

Return strict JSON:
{
  "finalVersion": "updated message",
  "whyThisWorks": "short explanation of the refinement",
  "confidenceScore": "High" | "Medium" | "Low",
  "confidenceReason": "short reason"
}
`.trim();
}

export function crossReviewPrompt(args: {
  selfModel: string;
  ownDraft: GeneratorResult;
  otherDraft: GeneratorResult;
  goal: string;
  inputText: string;
}) {
  return `
You are ${args.selfModel} in a one-round cross-review for a Revenue Copilot.
Review the other model's draft and compare it against yours.
Be candid, specific, and useful. You may revise your own draft once.
Do not ask questions. Do not loop.

Goal: ${args.goal}
Original input:
${args.inputText}

Your current draft:
${JSON.stringify(args.ownDraft, null, 2)}

Other model's draft:
${JSON.stringify(args.otherDraft, null, 2)}

Return strict JSON:
{
  "agreementLevel": "high" | "medium" | "low",
  "betterPoints": ["what the other model did better"],
  "weakerPoints": ["what the other model got wrong"],
  "shouldRevise": true,
  "revisedVersion": "your revised full draft"
}
`.trim();
}

export function fallbackGeneratorResult(modelName: string, inputText: string, goal: string): GeneratorResult {
  return {
    versionName: `${modelName} Fast Pass`,
    rewrittenMessage: `${inputText}\n\nGoal focus: ${goal}. Tighten the opening, make the ask concrete, and end with a specific next step.`,
    strengths: [
      "Keeps the original intent intact",
      "Adds a clearer action and outcome",
      "Improves momentum for a busy reader"
    ],
    weakness: "Needs real model judgment to become fully persuasive and polished."
  };
}

export function fallbackAnalysis(): AnalysisResult {
  return {
    winner: "tie",
    hook: "Both drafts need model-side judgment for a reliable hook comparison.",
    clarity: "Both are serviceable, but the best result should merge sharper structure with simpler wording.",
    persuasion: "Persuasion depends on specifics, proof, and how direct the ask feels.",
    structure: "A concise opener, clear value, and explicit CTA usually wins.",
    cta: "The strongest CTA is the one that asks for a low-friction next step.",
    bestElements: [
      "Lead with the core value quickly",
      "Keep the body tight and skimmable",
      "End with a specific next action"
    ]
  };
}

export function fallbackSynthesis(inputText: string, goal: string): SynthesisResult {
  return {
    finalVersion: `${inputText}\n\nOptimized for ${goal}: make the value obvious in the first line, keep each sentence earning its place, and finish with one clear CTA.`,
    whyThisWorks:
      "This version keeps the message direct, lowers friction for the reader, and sharpens the ask so the next step is easy to say yes to.",
    confidenceScore: "Medium",
    confidenceReason: "The structure is solid, but live model outputs and stronger source context would improve the result."
  };
}

export function fallbackCrossReview(existing: GeneratorResult): CrossReviewFeedback {
  return {
    agreementLevel: "medium",
    betterPoints: ["The other draft may have stronger phrasing in spots."],
    weakerPoints: ["The other draft may be less focused on the clearest CTA."],
    shouldRevise: true,
    revisedVersion: existing.rewrittenMessage
  };
}

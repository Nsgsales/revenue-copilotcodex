import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import {
  analysisPrompt,
  crossReviewPrompt,
  fallbackAnalysis,
  fallbackCrossReview,
  fallbackGeneratorResult,
  fallbackSynthesis,
  generatorPrompt,
  refinementPrompt,
  synthesisPrompt
} from "@/lib/prompts";
import type {
  AnalysisResult,
  CrossReviewFeedback,
  GeneratorResult,
  SynthesisResult
} from "@/lib/types";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1";
const claudeModel = process.env.CLAUDE_MODEL ?? "claude-3-7-sonnet-latest";

const generatorSchema = z.object({
  versionName: z.string(),
  rewrittenMessage: z.string(),
  strengths: z.array(z.string()).min(1),
  weakness: z.string()
});

const analysisSchema = z.object({
  winner: z.enum(["chatgpt", "claude", "tie"]),
  hook: z.string(),
  clarity: z.string(),
  persuasion: z.string(),
  structure: z.string(),
  cta: z.string(),
  bestElements: z.array(z.string()).min(1)
});

const synthesisSchema = z.object({
  finalVersion: z.string(),
  whyThisWorks: z.string(),
  confidenceScore: z.enum(["High", "Medium", "Low"]),
  confidenceReason: z.string()
});

const crossReviewSchema = z.object({
  agreementLevel: z.string(),
  betterPoints: z.array(z.string()).min(1),
  weakerPoints: z.array(z.string()).min(1),
  shouldRevise: z.boolean(),
  revisedVersion: z.string()
});

function extractJson(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1];
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

function parseWithSchema<T>(raw: string, schema: z.ZodSchema<T>): T {
  const parsed = JSON.parse(extractJson(raw));
  return schema.parse(parsed);
}

async function callOpenAI(prompt: string) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await openai.responses.create({
    model: openaiModel,
    input: prompt
  });

  return response.output_text;
}

async function callClaude(prompt: string) {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }]
  });

  const textBlocks = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  return textBlocks.join("\n");
}

export async function generateDrafts(args: {
  inputText: string;
  goal: string;
  attachments: { file_name: string; extracted_text: string }[];
}) {
  const openAiPromise = callOpenAI(
    generatorPrompt({ modelLabel: "ChatGPT", inputText: args.inputText, goal: args.goal, attachments: args.attachments })
  )
    .then((raw) => parseWithSchema(raw, generatorSchema))
    .catch(() => fallbackGeneratorResult("ChatGPT", args.inputText, args.goal));

  const claudePromise = callClaude(
    generatorPrompt({ modelLabel: "Claude", inputText: args.inputText, goal: args.goal, attachments: args.attachments })
  )
    .then((raw) => parseWithSchema(raw, generatorSchema))
    .catch(() => fallbackGeneratorResult("Claude", args.inputText, args.goal));

  const [chatgpt, claude] = await Promise.all([openAiPromise, claudePromise]);
  return { chatgpt, claude };
}

export async function analyzeDrafts(args: {
  inputText: string;
  goal: string;
  chatgpt: GeneratorResult;
  claude: GeneratorResult;
}): Promise<AnalysisResult> {
  try {
    const raw = await callClaude(analysisPrompt(args));
    return parseWithSchema(raw, analysisSchema);
  } catch {
    return fallbackAnalysis();
  }
}

export async function synthesizeDrafts(args: {
  inputText: string;
  goal: string;
  chatgpt: GeneratorResult;
  claude: GeneratorResult;
  analysis: AnalysisResult;
}): Promise<SynthesisResult> {
  try {
    const raw = await callClaude(synthesisPrompt(args));
    return parseWithSchema(raw, synthesisSchema);
  } catch {
    return fallbackSynthesis(args.inputText, args.goal);
  }
}

export async function refineVersion(args: {
  currentVersion: string;
  instruction: string;
  goal: string;
  attachments: { file_name: string; extracted_text: string }[];
}): Promise<SynthesisResult> {
  try {
    const raw = await callClaude(refinementPrompt(args));
    return parseWithSchema(raw, synthesisSchema);
  } catch {
    return {
      finalVersion: `${args.currentVersion}\n\nRefinement request: ${args.instruction}`,
      whyThisWorks: "This keeps the previous version intact while applying the requested refinement direction.",
      confidenceScore: "Medium",
      confidenceReason: "The fallback preserves continuity, but a live model refinement would be stronger."
    };
  }
}

export async function runCrossReview(args: {
  inputText: string;
  goal: string;
  chatgpt: GeneratorResult;
  claude: GeneratorResult;
}) {
  const openAiReview = callOpenAI(
    crossReviewPrompt({
      selfModel: "ChatGPT",
      ownDraft: args.chatgpt,
      otherDraft: args.claude,
      goal: args.goal,
      inputText: args.inputText
    })
  )
    .then((raw) => parseWithSchema(raw, crossReviewSchema))
    .catch(() => fallbackCrossReview(args.chatgpt));

  const claudeReview = callClaude(
    crossReviewPrompt({
      selfModel: "Claude",
      ownDraft: args.claude,
      otherDraft: args.chatgpt,
      goal: args.goal,
      inputText: args.inputText
    })
  )
    .then((raw) => parseWithSchema(raw, crossReviewSchema))
    .catch(() => fallbackCrossReview(args.claude));

  const [chatgptReview, claudeReviewResult] = await Promise.all([openAiReview, claudeReview]);

  return {
    chatgptReview,
    claudeReview: claudeReviewResult
  };
}

export async function synthesizeCrossReview(args: {
  inputText: string;
  goal: string;
  chatgptReview: CrossReviewFeedback;
  claudeReview: CrossReviewFeedback;
}) {
  const chatgptDraft: GeneratorResult = {
    versionName: "ChatGPT Revised",
    rewrittenMessage: args.chatgptReview.revisedVersion,
    strengths: args.chatgptReview.betterPoints,
    weakness: args.chatgptReview.weakerPoints.join(" ")
  };

  const claudeDraft: GeneratorResult = {
    versionName: "Claude Revised",
    rewrittenMessage: args.claudeReview.revisedVersion,
    strengths: args.claudeReview.betterPoints,
    weakness: args.claudeReview.weakerPoints.join(" ")
  };

  const analysis = await analyzeDrafts({
    inputText: args.inputText,
    goal: args.goal,
    chatgpt: chatgptDraft,
    claude: claudeDraft
  });

  const synthesis = await synthesizeDrafts({
    inputText: args.inputText,
    goal: args.goal,
    chatgpt: chatgptDraft,
    claude: claudeDraft,
    analysis
  });

  return { analysis, synthesis, chatgptDraft, claudeDraft };
}

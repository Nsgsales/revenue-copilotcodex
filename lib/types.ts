export type ConfidenceScore = "High" | "Medium" | "Low";

export type GoalOption =
  | "Conversion"
  | "Replies"
  | "Tone"
  | "Clarity"
  | "Persuasion"
  | "Decision";

export type ThreadRecord = {
  id: string;
  title: string;
  goal: string;
  original_input: string;
  created_at: string;
  updated_at: string;
};

export type MessageRecord = {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type FileAttachmentRecord = {
  id: string;
  thread_id: string;
  file_type: string;
  file_name: string;
  file_url: string;
  extracted_text: string;
  created_at: string;
};

export type ModelOutputRecord = {
  id: string;
  generation_run_id: string;
  model_name: string;
  version_name: string;
  rewritten_message: string;
  strengths: string[];
  weakness: string;
};

export type SynthesizedOutputRecord = {
  id: string;
  generation_run_id: string;
  final_version: string;
  why_this_works: string;
  confidence_score: ConfidenceScore;
  confidence_reason: string;
};

export type CrossReviewFeedbackRecord = {
  id: string;
  cross_review_run_id: string;
  model_name: string;
  agreement_level: string;
  better_points: string[];
  weaker_points: string[];
  revised_version: string;
};

export type GenerationRunDetail = {
  id: string;
  thread_id: string;
  input_text: string;
  goal: string;
  created_at: string;
  modelOutputs: ModelOutputRecord[];
  synthesizedOutput: SynthesizedOutputRecord | null;
  crossReviewRunId: string | null;
  crossReviewFeedback: CrossReviewFeedbackRecord[];
};

export type ThreadDetail = {
  thread: ThreadRecord;
  messages: MessageRecord[];
  attachments: FileAttachmentRecord[];
  generationRuns: GenerationRunDetail[];
};

export type GeneratorResult = {
  versionName: string;
  rewrittenMessage: string;
  strengths: string[];
  weakness: string;
};

export type AnalysisResult = {
  winner: "chatgpt" | "claude" | "tie";
  hook: string;
  clarity: string;
  persuasion: string;
  structure: string;
  cta: string;
  bestElements: string[];
};

export type SynthesisResult = {
  finalVersion: string;
  whyThisWorks: string;
  confidenceScore: ConfidenceScore;
  confidenceReason: string;
};

export type CrossReviewFeedback = {
  agreementLevel: string;
  betterPoints: string[];
  weakerPoints: string[];
  shouldRevise: boolean;
  revisedVersion: string;
};

export type GenerationResponse = {
  thread: ThreadRecord;
  generationRun: GenerationRunDetail;
  messages: MessageRecord[];
};

export function makeThreadTitle(input: string, goal: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    return `${goal} thread`;
  }

  return trimmed.length > 56 ? `${trimmed.slice(0, 53)}...` : trimmed;
}

export function summarizeMessage(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

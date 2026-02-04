import { encodingForModel, getEncoding } from "@dqbd/tiktoken";

const tokenizerCache = new Map<string, ReturnType<typeof getEncoding>>();

function getTokenizer(model: string) {
  if (tokenizerCache.has(model)) {
    return tokenizerCache.get(model)!;
  }

  try {
    const tokenizer = encodingForModel(model as Parameters<typeof encodingForModel>[0]);
    tokenizerCache.set(model, tokenizer);
    return tokenizer;
  } catch (error) {
    const fallback = getEncoding("cl100k_base");
    tokenizerCache.set(model, fallback);
    return fallback;
  }
}

export function countTokens(text: string, model = "gpt-4"): number {
  try {
    const tokenizer = getTokenizer(model);
    return tokenizer.encode(text).length;
  } catch (error) {
    return estimateTokens(text);
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

export function truncateText(
  text: string,
  model: string,
  maxTokens: number,
  suffix = "\n... [truncated]",
  preserveLines = true,
): string {
  const currentTokens = countTokens(text, model);
  if (currentTokens <= maxTokens) {
    return text;
  }

  const suffixTokens = countTokens(suffix, model);
  const targetTokens = maxTokens - suffixTokens;
  if (targetTokens <= 0) {
    return suffix.trim();
  }

  if (preserveLines) {
    return truncateByLines(text, targetTokens, suffix, model);
  }

  return truncateByChars(text, targetTokens, suffix, model);
}

function truncateByLines(text: string, targetTokens: number, suffix: string, model: string): string {
  const lines = text.split("\n");
  const resultLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(`${line}\n`, model);
    if (currentTokens + lineTokens > targetTokens) {
      break;
    }
    resultLines.push(line);
    currentTokens += lineTokens;
  }

  if (!resultLines.length) {
    return truncateByChars(text, targetTokens, suffix, model);
  }

  return `${resultLines.join("\n")}${suffix}`;
}

function truncateByChars(text: string, targetTokens: number, suffix: string, model: string): string {
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (countTokens(text.slice(0, mid), model) <= targetTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${text.slice(0, low)}${suffix}`;
}

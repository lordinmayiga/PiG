export type ThoughtSegmentType = 'keyword' | 'path' | 'number' | 'code' | 'text';

export interface ThoughtSegment {
  text: string;
  type: ThoughtSegmentType;
}

const ACTION_KEYWORDS = /^(#?\d+\.\s*)?(Inbound|Checking|Inspecting|Testing|Evaluating|Confirming|Emitted|Turn complete|Reading|Generating|Verifying|Cleaning|Formatting|Preparing|All reasoning steps complete)\b/i;
const FILE_PATH_REGEX = /([\w./-]+\.(?:ts|tsx|js|jsx|md|json|html|css|py|sh|png|jpg|svg)|\.pig-output\/?)/i;
const NUMBER_DURATION_REGEX = /\b(\$?\d+(?:\.\d+)?(?:s|ms|KB|MB|%|tokens|lines)?)\b/i;
const CODE_REGEX = /`([^`]+)`/;

/**
 * Tokenizes a single line of thought text into styled segments.
 */
export function tokenizeThoughtLine(rawLine: string): ThoughtSegment[] {
  let line = rawLine.trim();
  if (!line) return [];

  const segments: ThoughtSegment[] = [];

  // 1. Check leading action keyword / numbered prefix
  const kwMatch = line.match(ACTION_KEYWORDS);
  if (kwMatch) {
    const prefix = kwMatch[1] || '';
    const kw = kwMatch[2] || '';
    if (prefix) {
      segments.push({ text: prefix, type: 'text' });
    }
    segments.push({ text: kw, type: 'keyword' });
    line = line.slice(kwMatch[0].length);
  }

  // 2. Parse remaining tokens for paths, code, numbers
  while (line.length > 0) {
    const codeMatch = line.match(CODE_REGEX);
    const pathMatch = line.match(FILE_PATH_REGEX);
    const numMatch = line.match(NUMBER_DURATION_REGEX);

    type MatchCandidate = { index: number; length: number; text: string; type: ThoughtSegmentType };
    const candidates: MatchCandidate[] = [];

    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({ index: codeMatch.index, length: codeMatch[0].length, text: codeMatch[1], type: 'code' });
    }
    if (pathMatch && pathMatch.index !== undefined) {
      candidates.push({ index: pathMatch.index, length: pathMatch[0].length, text: pathMatch[0], type: 'path' });
    }
    if (numMatch && numMatch.index !== undefined) {
      candidates.push({ index: numMatch.index, length: numMatch[0].length, text: numMatch[0], type: 'number' });
    }

    if (candidates.length === 0) {
      segments.push({ text: line, type: 'text' });
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const first = candidates[0];

    if (first.index > 0) {
      segments.push({ text: line.slice(0, first.index), type: 'text' });
    }
    segments.push({ text: first.text, type: first.type });
    line = line.slice(first.index + first.length);
  }

  return segments;
}

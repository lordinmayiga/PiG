/**
 * Shared tool-name → human label logic for the agent-actions feed. Used by
 * both the backend parser (backend/src/agentProcess.ts, imported the same
 * way it already imports src/types/index.ts across the package boundary)
 * and the frontend (AgentActionsFeed's icon lookup), so both sides agree on
 * which raw CLI tool names mean "reading a file" vs. "running a command"
 * etc. — see AGENT_ACTIONS_STREAM_PLAN.md §2 for the verified event shapes
 * this is derived from.
 *
 * Plain TS, no RN/DOM deps, so it's safe to import from a Node backend file.
 */

export type ActionCategory = 'run' | 'read' | 'write' | 'edit' | 'search' | 'find' | 'other';

const RUN_TOOLS = new Set(['Bash', 'run_command']);
const READ_TOOLS = new Set(['Read', 'view_file']);
const WRITE_TOOLS = new Set(['Write', 'write_to_file']);
const EDIT_TOOLS = new Set([
  'Edit',
  'MultiEdit',
  'replace_file_content',
  'multi_replace_file_content',
  'sed_file',
  'notebook_edit',
]);
const SEARCH_TOOLS = new Set(['Grep', 'grep_search']);
const FIND_TOOLS = new Set(['Glob', 'find_by_name']);

export function categorizeTool(tool: string): ActionCategory {
  if (RUN_TOOLS.has(tool)) return 'run';
  if (READ_TOOLS.has(tool)) return 'read';
  if (WRITE_TOOLS.has(tool)) return 'write';
  if (EDIT_TOOLS.has(tool)) return 'edit';
  if (SEARCH_TOOLS.has(tool)) return 'search';
  if (FIND_TOOLS.has(tool)) return 'find';
  return 'other';
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function truncate(s: string, n = 60): string {
  const trimmed = s.trim();
  return trimmed.length > n ? `${trimmed.slice(0, n - 1)}…` : trimmed;
}

function firstString(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Generic label to show the instant a tool call starts, before its full
 * params are known (claude-code's `content_block_start` fires before the
 * streamed `input` JSON is complete). */
export function startingActionLabel(tool: string): string {
  switch (categorizeTool(tool)) {
    case 'run':
      return 'Running a command…';
    case 'read':
      return 'Reading a file…';
    case 'write':
      return 'Writing a file…';
    case 'edit':
      return 'Editing a file…';
    case 'search':
      return 'Searching…';
    case 'find':
      return 'Finding files…';
    default:
      return `Using ${tool}…`;
  }
}

/** Full label once the tool call's params are known — both CLIs' params use
 * different key casing (claude's `file_path` vs. agy's `AbsolutePath`), so
 * every relevant key is checked. */
export function deriveActionLabel(tool: string, params: Record<string, unknown> = {}): { label: string; detail?: string } {
  const category = categorizeTool(tool);
  switch (category) {
    case 'run': {
      const cmd = firstString(params, ['command', 'CommandLine']) ?? '';
      return cmd ? { label: `Running: ${truncate(cmd)}`, detail: cmd } : { label: startingActionLabel(tool) };
    }
    case 'read': {
      const path = firstString(params, ['file_path', 'AbsolutePath', 'path']) ?? '';
      return path ? { label: `Reading ${basename(path)}`, detail: path } : { label: startingActionLabel(tool) };
    }
    case 'write': {
      const path = firstString(params, ['file_path', 'AbsolutePath', 'path']) ?? '';
      return path ? { label: `Writing ${basename(path)}`, detail: path } : { label: startingActionLabel(tool) };
    }
    case 'edit': {
      const path = firstString(params, ['file_path', 'AbsolutePath', 'path']) ?? '';
      return path ? { label: `Editing ${basename(path)}`, detail: path } : { label: startingActionLabel(tool) };
    }
    case 'search': {
      const pattern = firstString(params, ['pattern', 'Pattern', 'Query', 'query']) ?? '';
      return pattern
        ? { label: `Searching for "${truncate(pattern, 40)}"`, detail: pattern }
        : { label: startingActionLabel(tool) };
    }
    case 'find': {
      const pattern = firstString(params, ['pattern', 'Pattern', 'query']) ?? '';
      return pattern
        ? { label: `Finding files matching "${truncate(pattern, 40)}"`, detail: pattern }
        : { label: startingActionLabel(tool) };
    }
    default:
      return { label: `Using ${tool}` };
  }
}

/** Truncates a tool's raw output/result for the feed's collapsed preview. */
export function truncateActionOutput(output: string, n = 240): string {
  return truncate(output, n);
}

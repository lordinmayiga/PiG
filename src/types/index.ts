// Shared domain types for PiG's Phase 4 screens. These model the fixture/mock data
// shape today; Phase 6's real websocket client should be able to populate the same
// shapes without screens needing to change (SETUP_PLAN.md Phase 4 goal: "wiring the
// real backend later is a data-source swap, not a rebuild").

export type AgentKind = 'claude-code' | 'antigravity';

export type SessionStatus = 'active' | 'idle' | 'disconnected';

export interface Session {
  id: string;
  name: string;
  agent: AgentKind;
  /** Absolute path on the VPS this session's agent process was started in. */
  folder: string;
  status: SessionStatus;
  createdAt: string; // ISO 8601
  lastActivityAt: string; // ISO 8601
  /** Short plain-text preview of the most recent message, for the Sessions card list. */
  lastMessagePreview: string;
}

export type MessageRole = 'user' | 'agent';

/** Agent-side streaming/lifecycle status, shown via the turn header's status dot.
 * 'cutoff' (pig-screen-states' "partial" transcript case): the connection
 * dropped mid-stream, before a `done: true` chunk arrived for this turn.
 * Distinct from 'done' (never silently presented as a completed turn) and
 * from 'error' (this isn't a server-reported failure — the turn may still be
 * running server-side; the app just lost the stream). Whatever partial
 * content already arrived is kept, not discarded. */
export type AgentTurnStatus = 'streaming' | 'done' | 'error' | 'cutoff';

export interface FileAttachment {
  id: string;
  name: string;
  /** MIME type, used to pick the file-viewer sheet variant. */
  mimeType: string;
  sizeBytes: number;
  /** Relative path within the session's working folder. */
  path: string;
  kind: 'image' | 'text' | 'other';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export type AgentActionStatus = 'running' | 'done' | 'error';

/** One tool call the agent made during a turn (reading/writing a file,
 * running a command, searching, ...) — the live "what is it doing right
 * now" signal, distinct from (and replacing, in the UI) internal reasoning
 * text. Sourced from real tool_use/tool_result (claude-code) or step_type:
 * 'tool' (antigravity) events — see backend/src/actionLabels.ts. */
export interface AgentAction {
  id: string;
  /** Raw tool identifier from the CLI, e.g. 'Bash', 'Read', 'run_command', 'view_file'. */
  tool: string;
  /** Human-friendly summary, e.g. "Reading package.json". */
  label: string;
  /** Full command/path, for an expanded view. */
  detail?: string;
  status: AgentActionStatus;
  /** Truncated result preview, once done/error. */
  output?: string;
  startedAt: string; // ISO 8601
}

export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  timestamp: string; // ISO 8601
  /** Markdown body (agent turns may include fenced code blocks). */
  content: string;
  /** Internal thinking stream or reasoning steps for this turn. Retained on
   * the wire (harmless, and antigravity's parser still uses it to strip
   * stray <thought> tags out of the visible content), but no longer
   * rendered — see AgentAction/actions below for what the UI shows instead. */
  thinking?: string;
  /** Tool calls made during this turn, in order, live-updated as they run. */
  actions?: AgentAction[];
  /** Only meaningful for role: 'agent'. */
  status?: AgentTurnStatus;
  /** Only meaningful for role: 'user' — the outcome of *sending* this
   * message (pig-network-states), a separate concept from `status` above
   * (which tracks an agent turn's own streaming lifecycle, not send
   * outcome). Undefined means a message that predates this tracking (e.g.
   * loaded from cache/resync) — treated the same as 'sent' for rendering,
   * since a message that came back from the server obviously sent fine. */
  sendStatus?: 'pending' | 'sent' | 'failed';
  attachments?: FileAttachment[];
  usage?: TokenUsage;
}

export type FileNodeType = 'file' | 'folder';

export interface FileNode {
  name: string;
  type: FileNodeType;
  /** Path relative to the session's working folder root. */
  path: string;
  sizeBytes?: number; // files only
  mimeType?: string; // files only
  modifiedAt?: string; // ISO 8601
}

export interface VpsConnection {
  host: string;
  paired: boolean;
  lastConnectedAt?: string; // ISO 8601
}

export interface OpenRouterSettings {
  hasKey: boolean;
  /** Last 4 chars only, for display — never the full key client-side. */
  keySuffix?: string;
}

// --- Bridge protocol types ---
// Wire format for the app <-> VPS backend websocket bridge, per
// SPEC.md §4/§8. One envelope shape both directions; `payload` narrows by `type`.

/** Every message sent or received over the bridge websocket has this shape. */
export interface Envelope<TPayload = unknown> {
  v: 1;
  type: BridgeEventType;
  /** uuid, for request/response correlation. */
  id: string;
  /** ms epoch. */
  ts: number;
  /** Present for session-scoped events. */
  sessionId?: string;
  payload: TPayload;
}

/** Events the app sends to the backend. */
export type AppToBackendEventType =
  | 'hello'
  | 'resync_request'
  | 'route_input'
  | 'action_confirm'
  | 'ping'
  | 'fs_list'
  | 'fs_read'
  | 'fs_raw_url_request'
  | 'set_openrouter_key'
  | 'get_openrouter_key'
  | 'command_search'
  | 'set_session_model'
  | 'get_session_usage';

/** Events the backend sends to the app. */
export type BackendToAppEventType =
  | 'hello_ack'
  | 'resync_snapshot'
  | 'session_list_update'
  | 'transcript_chunk'
  | 'action_result'
  | 'error'
  | 'pong'
  | 'fs_list_result'
  | 'fs_read_result'
  | 'fs_raw_url_result'
  | 'set_openrouter_key_ack'
  | 'get_openrouter_key_ack'
  | 'command_search_result'
  | 'set_session_model_ack'
  | 'get_session_usage_ack';

export type BridgeEventType = AppToBackendEventType | BackendToAppEventType;

/** app -> backend: auth handshake. */
export interface HelloPayload {
  token: string;
  /** App/client version string, for backend-side compat logging. */
  clientVersion?: string;
}

/** app -> backend: request a full resync (reconnect path, SPEC §8). */
export interface ResyncRequestPayload {
  /** If set, only resync this session's active state; otherwise all sessions. */
  sessionId?: string;
}

/** app -> backend: composer submission routed through /route-input. */
export interface RouteInputPayload {
  sessionId: string;
  text: string;
  attachmentIds?: string[];
}

/** app -> backend: confirms a previously proposed destructive action. */
export interface ActionConfirmPayload {
  /** id of the action_result envelope this confirms. */
  actionId: string;
  confirmed: boolean;
}

/** app -> backend: keepalive. */
export type PingPayload = Record<string, never>;

/** backend -> app: handshake accepted. */
export interface HelloAckPayload {
  ok: boolean;
  serverVersion?: string;
}

/** backend -> app: full state snapshot — the reconnect resync path (SPEC §8). */
export interface ResyncSnapshotPayload {
  sessions: Session[];
  /** Present when the resync was scoped to one session. */
  sessionId?: string;
  transcript?: TranscriptMessage[];
  /** id/ts of the newest message included, for cache cursor bookkeeping. */
  syncCursor?: string;
}

/** backend -> app: session list changed (created/renamed/status/deleted). */
export interface SessionListUpdatePayload {
  sessions: Session[];
}

/** backend -> app: one streamed chunk of an agent turn. */
export interface TranscriptChunkPayload {
  sessionId: string;
  message: TranscriptMessage;
  /** True when this chunk completes the turn. */
  done: boolean;
}

/** backend -> app: result of a route_input classification or action_confirm. */
export interface ActionResultPayload {
  /** id of the request envelope this responds to. Always matches the
   * originating `route_input`/`action_confirm` envelope's own id, so a
   * client can correlate a reply back to the request it sent regardless of
   * `kind` — including `action_pending_confirm`, which additionally hands
   * back a separate `actionId` (see below). */
  requestId: string;
  kind: 'prompt_routed' | 'action_pending_confirm' | 'action_executed' | 'action_rejected';
  /** Cleaned prompt text, when kind is 'prompt_routed'. */
  cleanedPrompt?: string;
  /** Human-readable summary of the routed/executed action. */
  summary?: string;
  /** Only present when kind is 'action_pending_confirm': the id of the
   * server-side pending action itself, distinct from `requestId`. Echo this
   * back (not `requestId`) as `ActionConfirmPayload.actionId`. */
  actionId?: string;
}

/** backend -> app: typed error. */
export type BridgeErrorCode = 'bad_token' | 'unreachable' | 'timeout' | 'internal';

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  /** id of the request envelope this error responds to, if any. */
  requestId?: string;
}

/** backend -> app: keepalive reply. */
export type PongPayload = Record<string, never>;

/** app -> backend: list files/directories on the VPS filesystem. */
export interface FsListPayload {
  path?: string;
}

export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  sizeBytes?: number;
  mimeType?: string;
}

/** backend -> app: results of listing a directory on the VPS filesystem. */
export interface FsListResultPayload {
  path: string;
  entries: FsEntry[];
  error?: string;
}

/** app -> backend: read file contents from the VPS filesystem. */
export interface FsReadPayload {
  path: string;
}

/** backend -> app: file content from the VPS filesystem. */
export interface FsReadResultPayload {
  path: string;
  content?: string;
  error?: string;
}

/** app -> backend: save OpenRouter API key on VPS. */
export interface SetOpenRouterKeyPayload {
  apiKey: string;
}

/** backend -> app: save OpenRouter API key response. */
export interface SetOpenRouterKeyAckPayload {
  ok: boolean;
  keySuffix?: string;
  error?: string;
}

/** app -> backend: get current OpenRouter settings. */
export type GetOpenRouterKeyPayload = Record<string, never>;

/** backend -> app: get current OpenRouter settings response. */
export interface GetOpenRouterKeyAckPayload {
  hasKey: boolean;
  keySuffix?: string;
}

/** app -> backend: request a temporary URL to view raw file content over HTTP. */
export interface FsRawUrlPayload {
  path: string;
}

/** backend -> app: temporary raw URL response. */
export interface FsRawUrlResultPayload {
  url: string;
  path: string;
  error?: string;
}

export interface SlashCommandItem {
  name: string;
  description: string;
  badge?: string;
  icon?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  badge?: string;
  effort?: string;
}

/** app -> backend: search terminal/slash commands */
export interface CommandSearchPayload {
  query: string;
  sessionId?: string;
}

/** backend -> app: search results for terminal/slash commands */
export interface CommandSearchResultPayload {
  query: string;
  commands: SlashCommandItem[];
  models?: ModelInfo[];
  usage?: TokenUsage;
}

/** app -> backend: switch active model for session */
export interface SetSessionModelPayload {
  sessionId: string;
  model: string;
  effort?: string;
}

/** backend -> app: confirmation of model switch */
export interface SetSessionModelAckPayload {
  ok: boolean;
  sessionId: string;
  model: string;
  effort?: string;
  error?: string;
}

/** app -> backend: request session token usage */
export interface GetSessionUsagePayload {
  sessionId: string;
}

/** backend -> app: session token usage */
export interface GetSessionUsageAckPayload {
  sessionId: string;
  usage: TokenUsage;
}


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

/** Agent-side streaming/lifecycle status, shown via the turn header's status dot. */
export type AgentTurnStatus = 'streaming' | 'done' | 'error';

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

export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  timestamp: string; // ISO 8601
  /** Markdown body (agent turns may include fenced code blocks). */
  content: string;
  /** Only meaningful for role: 'agent'. */
  status?: AgentTurnStatus;
  attachments?: FileAttachment[];
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

// --- Bridge protocol types (Phase 6) ---
// Wire format for the app <-> VPS backend websocket bridge, per
// PHASE_5_6_PLAN.md's "proposed decision: websocket wire format" and
// SPEC.md §4/§8. One envelope shape both directions; `payload` narrows by
// `type`. Not yet confirmed with the real backend (which doesn't exist
// yet) — see src/dev/mockBridgeServer.ts for the current stand-in.

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
  | 'ping';

/** Events the backend sends to the app. */
export type BackendToAppEventType =
  | 'hello_ack'
  | 'resync_snapshot'
  | 'session_list_update'
  | 'transcript_chunk'
  | 'action_result'
  | 'error'
  | 'pong';

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
  /** id of the request envelope this responds to. */
  requestId: string;
  kind: 'prompt_routed' | 'action_pending_confirm' | 'action_executed' | 'action_rejected';
  /** Cleaned prompt text, when kind is 'prompt_routed'. */
  cleanedPrompt?: string;
  /** Human-readable summary of the routed/executed action. */
  summary?: string;
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

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

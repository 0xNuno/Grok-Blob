export const THE_FIRST_ID = "2f4ba667-3cbd-4603-bc8b-64ad6af7634f";
export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:1340";
export const HOTKEY = "Command+Shift+Space";
/** Fallback summon when Space is taken by another app. */
export const HOTKEY_ALT = "Command+Shift+B";
export const DISPLAY_HOTKEY = "Command+Shift+M";
export const CAPTURE_HOTKEY = "CommandOrControl+Shift+2";
export const SYNC_HOTKEY = "CommandOrControl+Shift+R";
export const ACTIVITY_SCHEMA = "blob.activity/v1";
export const MINE_SCHEMA = "blob.mine/v1";

export type AgentRow = {
  id: string;
  name: string;
  isGroup: boolean;
  isRunning: boolean;
  isComposingMessage: boolean;
  awaitingUserResponse: boolean;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  mine?: boolean;
};

export type ChatReplyTo = {
  id: string;
  role?: "user" | "assistant";
  text: string;
};

export type ChatWidgetOption = {
  label: string;
  value: string;
  description?: string;
  style?: "default" | "primary" | "danger";
};

export type ChatWidgetField = {
  label: string;
  value: string;
};

export type ChatWidgetKind = "choice" | "approval" | "secret" | "cursor-agent" | "status";

export type ChatWidget = {
  kind: ChatWidgetKind;
  prompt: string;
  helpText?: string;
  options?: ChatWidgetOption[];
  fields?: ChatWidgetField[];
  allowCustom?: boolean;
  pending?: boolean;
  status?: string;
  selected?: string;
  requestId?: string;
  gate?: "auto-review" | "local-tool";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  replyToId?: string;
  replyTo?: ChatReplyTo;
  reactions?: MessageReaction[];
  widget?: ChatWidget;
};

export type AttachmentChip = {
  id: string;
  kind: "image";
  mediaType: string;
  bytes: number;
  /** Small data-URL thumbnail for the composer. Full bytes stay in main. */
  thumb: string;
};

export type PublicSettings = {
  gatewayUrl: string;
  tokenSet: boolean;
};

export type SheetState = {
  configured: boolean;
  settings: PublicSettings;
  agents: AgentRow[];
  agentId: string | null;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  /** Soft nudge (public gateway URL). Never treats connect as failed. */
  warning: string | null;
  hotkeyTaken: boolean;
  status: string;
  attachments: AttachmentChip[];
  /** Agents with new activity while the user was on a different chat. Cleared on select. */
  unreadAgentIds: string[];
};

export type SaveSettingsInput = {
  gatewayUrl: string;
  token?: string;
};

export type ActivityTaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "next"
  | "done"
  | "failed";

export type ActivityTask = {
  id: string;
  title: string;
  /** Known baseline statuses, or any other string (muted unknown). */
  status: ActivityTaskStatus | (string & {});
  updatedAt: string;
  agentId?: string;
  agentName?: string;
  /** Few-line description. Writers may send `description`; readers copy it here. */
  note?: string;
  /**
   * Optional rank kept in sync with array index (0 = highest).
   * Array order is the source of truth; readers may ignore this field.
   */
  priority?: number;
};

export type ActivityFeed = {
  schema: typeof ACTIVITY_SCHEMA;
  tasks: ActivityTask[];
  source: "userData" | "project" | "cwd" | "merged";
};

export type MineFeed = {
  schema: typeof MINE_SCHEMA;
  tasks: ActivityTask[];
  source: "userData";
};

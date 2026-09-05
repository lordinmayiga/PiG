import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  AlertCircle,
  ChevronLeft,
  FlaskConical,
  FolderOpen,
  GitCommitHorizontal,
  ListTodo,
  Rocket,
  Search,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useFadeSlideIn } from '../theme/motion';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { AgentKind, FileAttachment, TranscriptMessage } from '../types';
import { getCached, appendAndPersist, replaceAll, mergeTranscripts } from '../transcriptCache';
import { useBridge } from '../contexts/BridgeContext';
import { useSessions } from '../contexts/SessionsContext';
import { AgentStatusDot } from '../components/AgentStatusDot';
import { MarkdownBody } from '../components/MarkdownBody';
import { FileAttachmentChip } from '../components/FileAttachmentChip';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';
import { Composer, type ComposerAttachment } from '../components/Composer';
import { TypingIndicator } from '../components/TypingIndicator';
import { AgentActionsFeed } from '../components/AgentActionsFeed';
import { SlashCommandOverlay } from '../components/SlashCommandOverlay';

type Nav = NativeStackNavigationProp<SessionsStackParamList, 'Transcript'>;
type TranscriptRoute = RouteProp<SessionsStackParamList, 'Transcript'>;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function attachmentToViewable(attachment: FileAttachment): ViewableFile {
  return {
    name: attachment.name,
    path: attachment.path,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    imageUri: attachment.path.startsWith('file://') || attachment.path.startsWith('content://') ? attachment.path : undefined,
  };
}

let nextMessageId = Date.now();

interface StarterPrompt {
  icon: LucideIcon;
  label: string;
}

const STARTER_PROMPTS: StarterPrompt[] = [
  { icon: Search, label: 'Explain this project' },
  { icon: GitCommitHorizontal, label: 'Summarize recent git commits' },
  { icon: FlaskConical, label: 'Run test suite' },
  { icon: ListTodo, label: 'What tasks are open?' },
];

interface TranscriptRowProps {
  item: TranscriptMessage;
  onOpenAttachment: (attachment: FileAttachment) => void;
  onOpenFile: (path: string) => void;
  onRetrySend: (message: TranscriptMessage) => void;
}

function TranscriptRow({ item, onOpenAttachment, onOpenFile, onRetrySend }: TranscriptRowProps) {
  const { colors, spacing, typeScale } = useTheme();
  const animatedStyle = useFadeSlideIn();

  if (item.role === 'user') {
    const sendFailed = item.sendStatus === 'failed';
    const sendPending = item.sendStatus === 'pending';
    return (
      <Animated.View style={[styles.userRow, { paddingHorizontal: spacing.md, marginBottom: spacing.md }, animatedStyle]}>
        <View
          style={[
            styles.userBubble,
            { backgroundColor: colors.accent, borderRadius: 18, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
            // A failed send still shows its bubble (never vanishes) but reads
            // visibly unresolved — dimmed toward the disabled opacity rather
            // than a second hardcoded treatment (pig-color-system).
            sendFailed && { opacity: 0.6 },
          ]}
        >
          <Text style={[typeScale.body, { color: colors.onAccent }]} maxFontSizeMultiplier={1.3}>
            {item.content}
          </Text>
        </View>
        {item.attachments && item.attachments.length > 0 ? (
          <View style={[styles.attachmentsWrap, { gap: spacing.xxs, marginTop: spacing.xxs }]}>
            {item.attachments.map((attachment) => (
              <FileAttachmentChip key={attachment.id} attachment={attachment} onPress={onOpenAttachment} />
            ))}
          </View>
        ) : null}
        {sendFailed ? (
          <View style={[styles.sendFailedRow, { marginTop: spacing.xxs, gap: spacing.xxs }]}>
            <Icon icon={AlertCircle} size={16} color={colors.destructive} />
            <Text style={[typeScale.caption, { color: colors.destructive }]} maxFontSizeMultiplier={1.3}>
              Couldn&apos;t send.
            </Text>
            <Pressable
              onPress={() => onRetrySend(item)}
              accessibilityRole="button"
              accessibilityLabel="Retry sending message"
              hitSlop={8}
            >
              <Text
                style={[typeScale.caption, { color: colors.destructive, fontWeight: '700', textDecorationLine: 'underline' }]}
                maxFontSizeMultiplier={1.3}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
            {sendPending ? 'Sending…' : relativeTime(item.timestamp)}
          </Text>
        )}
      </Animated.View>
    );
  }

  const status = item.status ?? 'done';
  return (
    <Animated.View testID="agent-turn-bubble" style={[styles.agentTurn, { paddingHorizontal: spacing.md, marginBottom: spacing.lg }, animatedStyle]}>
      <View style={[styles.turnHeader, { marginBottom: spacing.xs }]}>
        <Text style={[typeScale.subheading, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
          Agent
        </Text>
        <AgentStatusDot status={status} />
        <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
          {relativeTime(item.timestamp)}
        </Text>
      </View>
      {item.actions && item.actions.length > 0 ? <AgentActionsFeed actions={item.actions} /> : null}
      {status === 'error' ? (
        <Text style={[typeScale.body, { color: colors.destructive }]} maxFontSizeMultiplier={1.3}>
          {item.content}
        </Text>
      ) : status === 'streaming' && item.content.trim() === '' && !(item.actions && item.actions.length > 0) ? (
        <TypingIndicator />
      ) : item.content.trim() !== '' ? (
        <MarkdownBody content={item.content} onOpenFile={onOpenFile} />
      ) : null}
      {status === 'cutoff' ? (
        // pig-screen-states' "partial" transcript case: the connection
        // dropped before this turn's `done: true` chunk arrived. Whatever
        // content streamed in above is kept as-is — this caption just makes
        // clear it isn't a finished turn, distinct from a normal 'done' dot.
        <Text style={[typeScale.caption, { color: colors.warning, marginTop: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
          Cut off — reconnect to continue.
        </Text>
      ) : null}
      {item.attachments && item.attachments.length > 0 ? (
        <View style={[styles.attachmentsWrap, { gap: spacing.xxs, marginTop: spacing.sm }]}>
          {item.attachments.map((attachment) => (
            <FileAttachmentChip key={attachment.id} attachment={attachment} onPress={onOpenAttachment} />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Model badge shown before the user has picked a model for this session (or
 * before the session's real current model has synced from the bridge) —
 * a sensible per-agent default rather than a single hardcoded Gemini string
 * (UI_FIXES_PLAN.md §2). Matches `sessionRegistry.ts`'s
 * `defaultModelForAgent` on the backend: `claude-code` sessions default to
 * Claude, `antigravity` sessions keep the existing Gemini default.
 */
function defaultModelBadgeForAgent(agent: AgentKind | undefined): string {
  return agent === 'claude-code' ? 'Claude Sonnet 5' : 'Gemini 3.8 Flash (Low)';
}

export default function TranscriptScreen() {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<TranscriptRoute>();
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const { sessions } = useSessions();
  // Matches by `id` (tmux's internal "$N", used once a session is reopened
  // from the Sessions list — SessionsScreen passes `session.id`) OR `name`
  // (used right after creation — SessionsScreen's create flow navigates
  // here with `draft.name` before the backend has ever returned a real id,
  // per UI_FIXES_PLAN.md item 3's e2e run: without the `name` fallback,
  // `session` is always undefined for a just-created session, silently
  // breaking every session-derived default — model badge, Files folder —
  // for exactly the case a new user hits first). tmux session names are
  // unique, so this can't introduce ambiguity.
  const session = sessions.find((s) => s.id === sessionId || s.name === sessionId);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const [slashOverlayVisible, setSlashOverlayVisible] = useState(false);
  // Badge's initial value must reflect which CLI this session actually runs
  // (`claude-code` vs `antigravity`) rather than a single hardcoded Gemini
  // string — see UI_FIXES_PLAN.md §2. Once the user picks a model via
  // `/model`, `onSelectModel` below overwrites this with the real choice.
  const [sessionModelBadge, setSessionModelBadge] = useState(() => defaultModelBadgeForAgent(session?.agent));
  // `sessions` (from `useSessions()`) can still be loading when this screen
  // first mounts, in which case the initializer above fell back to
  // `session?.agent === undefined`'s default. Re-derive once the real
  // `session.agent` arrives — but only until the user actually picks a
  // model via `/model`, after which their choice must stick.
  const userPickedModelRef = useRef(false);
  useEffect(() => {
    if (!userPickedModelRef.current && session?.agent) {
      setSessionModelBadge(defaultModelBadgeForAgent(session.agent));
    }
  }, [session?.agent]);
  const { client } = useBridge();
  // Track B placeholder-swap fix (REAL_AGENT_CONNECTION_PLAN.md §3a.1): the
  // optimistic local `agentReply` bubble appended in `handleSend` has a
  // client-generated id (`local-msg-N`) that a real server-streamed
  // `transcript_chunk` will never share. Keyed by sessionId so a stale
  // pending id from a previous session (or a fast session switch) can never
  // clobber the wrong transcript's placeholder.
  const pendingPlaceholderIdRef = useRef<Record<string, string | undefined>>({});

  const flatListRef = useRef<FlatList<TranscriptMessage>>(null);
  const isNearBottomRef = useRef(true);
  const keyboardVisible = useKeyboardVisible();

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceToBottom < 80;
  }, []);

  useEffect(() => {
    if (keyboardVisible && isNearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [keyboardVisible, scrollToBottom]);

  const handleContentSizeChange = useCallback(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [scrollToBottom]);

  // Read-through the transcript cache (src/transcriptCache.ts) on mount —
  // instant paint from whatever's cached, per PHASE_5_6_PLAN.md's storage
  // schema ("render cache immediately, then send resync_request").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getCached(sessionId);
      if (!cancelled) {
        setMessages(cached?.messages ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Real resync + live streaming, once a bridge client exists (BridgeContext
  // only provides one once paired — see RootNavigator). `resync_snapshot`
  // (scoped to this session, via requestResync's sessionId) replaces the
  // cache with server truth; `transcript_chunk` appends/updates live turns
  // as they stream in.
  //
  // KNOWN GAP: the VPS backend's `route_input` handler (BACKEND_SETUP_PLAN.md
  // phase 4) only classifies/cleans a prompt — it doesn't yet spawn/pipe an
  // agent turn for it (that's `agentProcess.ts`'s job, not wired to
  // `route_input` in `server.ts` yet), so no real `transcript_chunk` will
  // arrive for a submission sent through this screen today. `handleSend`
  // below still drives its own local fake-streaming reply so the screen
  // stays usable/demoable in the meantime — remove that once turns really
  // stream from the backend.
  useEffect(() => {
    if (!client) return;
    client.requestResync({ sessionId });

    const unsubscribeResync = client.onResyncSnapshot((snapshot) => {
      if (snapshot.sessionId !== sessionId || !snapshot.transcript) return;
      // Server truth can legitimately be shorter than what's on-screen: the
      // backend's transcript registry is in-memory (see sessionRegistry.ts)
      // and, even with best-effort JSONL persistence, a resync racing a
      // fresh-after-restart registry entry can return fewer messages than
      // the client already has cached/rendered from before the restart.
      // Never let a shorter snapshot destructively clobber a longer local
      // transcript the user has already seen — merge instead: keep every
      // local message, upsert-by-id anything the snapshot has newer/extra,
      // and only fall back to straight replacement when the snapshot is the
      // longer/equal one (the normal, expected resync case).
      setMessages((prev) => {
        const merged = mergeTranscripts(prev, snapshot.transcript!);
        void replaceAll(sessionId, merged);
        return merged;
      });
    });

    const unsubscribeChunk = client.onTranscriptChunk((chunk) => {
      if (chunk.sessionId !== sessionId) return;
      console.log(`[PiG Chat] Received chunk from agent for "${sessionId}" (done: ${chunk.done}, status: ${chunk.message.status}): "${chunk.message.content.slice(-60)}"`);
      setMessages((prev) => {
        const pendingPlaceholderId = pendingPlaceholderIdRef.current[sessionId];
        let next: TranscriptMessage[];
        if (pendingPlaceholderId) {
          // First live chunk for this turn: replace the optimistic
          // placeholder bubble in place (by index) instead of upserting by
          // id, since the placeholder's client-generated id never matches
          // the server-generated message id the chunk carries.
          const placeholderIndex = prev.findIndex((m) => m.id === pendingPlaceholderId);
          next =
            placeholderIndex === -1
              ? [...prev, chunk.message]
              : prev.map((m, i) => (i === placeholderIndex ? chunk.message : m));
          pendingPlaceholderIdRef.current[sessionId] = undefined;
        } else {
          const existingIndex = prev.findIndex((m) => m.id === chunk.message.id);
          next =
            existingIndex === -1
              ? [...prev, chunk.message]
              : prev.map((m, i) => (i === existingIndex ? chunk.message : m));
        }
        if (chunk.done) void replaceAll(sessionId, next);
        return next;
      });
    });

    return () => {
      unsubscribeResync();
      unsubscribeChunk();
    };
  }, [client, sessionId]);

  const openAttachment = useCallback(
    async (attachment: FileAttachment) => {
      setViewerFile(attachmentToViewable(attachment));
      if (attachment.kind === 'text') {
        if (client) {
          try {
            const content = await client.fsRead(attachment.path);
            setViewerContent(content);
          } catch {
            setViewerContent(undefined);
          }
        } else {
          setViewerContent(undefined);
        }
      } else {
        setViewerContent(undefined);
      }
    },
    [client],
  );

  const closeViewer = useCallback(() => {
    setViewerFile(null);
    setViewerContent(undefined);
  }, []);

  // Opens a file referenced by an inline markdown link (see
  // fileLinkClassifier/MarkdownBody's onOpenFile) in the same FileViewerSheet
  // attachment chips use — reusing openAttachment's viewer state rather than
  // a second sheet. Unlike an attachment, an inline link carries no known
  // mime/size ahead of time, so `kind` is inferred from the extension.
  const openFileLink = useCallback(
    async (rawPath: string) => {
      const name = rawPath.split('/').pop() || rawPath;
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
      setViewerFile({ name, path: rawPath, kind: isImage ? 'image' : 'text' });
      if (!isImage && client) {
        try {
          const content = await client.fsRead(rawPath);
          setViewerContent(content);
        } catch {
          setViewerContent(undefined);
        }
      } else {
        setViewerContent(undefined);
      }
    },
    [client],
  );

  const handleSend = useCallback(
    (text: string, attachments: ComposerAttachment[], alreadySent = false) => {
      const isConnected = Boolean(client && client.getStatus() === 'connected');
      const userMessage: TranscriptMessage = {
        id: `local-msg-${nextMessageId++}`,
        role: 'user',
        timestamp: new Date().toISOString(),
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        // No delivery ack exists yet for a routed prompt, so this is the
        // best signal available today: 'sent' once handed to a connected
        // bridge client, 'failed' when there's no connection to send it on
        // (surfaces the Retry affordance above instead of silently no-op'ing).
        sendStatus: isConnected ? 'sent' : 'failed',
      };
      const replyId = `local-msg-${nextMessageId++}`;
      const agentReply: TranscriptMessage = {
        id: replyId,
        role: 'agent',
        timestamp: new Date().toISOString(),
        status: isConnected ? 'streaming' : 'error',
        content: isConnected ? '' : 'Disconnected from VPS. Reconnect to send messages.',
      };
      console.log(`[PiG Chat] User clicked Send for session "${sessionId}": "${text}" (attachments: ${attachments.length}, isConnected: ${isConnected}, alreadySent: ${alreadySent})`);
      isNearBottomRef.current = true;
      setMessages((prev) => [...prev, userMessage, agentReply]);
      void appendAndPersist(sessionId, [userMessage, agentReply]);
      if (isConnected && client) {
        pendingPlaceholderIdRef.current[sessionId] = replyId;
        if (!alreadySent) {
          console.log(`[PiG Chat] Routing message to bridge WebSocket client: "${text}"`);
          client.sendRouteInput({
            sessionId,
            text,
            attachmentIds: attachments.map((a) => a.id),
          });
        }
      }
      setTimeout(() => scrollToBottom(true), 50);
    },
    [sessionId, client, scrollToBottom],
  );

  // Retries a failed user message by resending its original content/attachments
  // as a brand-new send — the failed bubble stays in the transcript as history
  // rather than being mutated in place, consistent with how a real chat client
  // shows a resend (pig-network-states' retry policy: retry re-attempts the
  // same action, it doesn't hide that the first attempt failed).
  const handleRetrySend = useCallback(
    (message: TranscriptMessage) => {
      handleSend(message.content, message.attachments ?? []);
    },
    [handleSend],
  );

  const renderEmptyTranscript = () => {
    const agentKind = session?.agent ?? 'claude-code';
    const AgentIcon = agentKind === 'antigravity' ? Rocket : SquareTerminal;
    const agentLabel = agentKind === 'antigravity' ? 'Antigravity' : 'Claude Code';
    const folder = session?.folder || '/root/projects/PiG';

    return (
      <View style={[styles.emptyContainer, { paddingHorizontal: spacing.md, paddingTop: spacing.md }]}>
        <View
          style={[
            styles.agentHeaderCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.agentCardTop}>
            <View style={[styles.agentIconWrap, { backgroundColor: colors.canvas, borderRadius: radius.chip }]}>
              <Icon icon={AgentIcon} size={24} color={colors.accent} />
            </View>
            <View style={styles.agentCardMeta}>
              <View style={styles.agentTitleRow}>
                <Text style={[typeScale.subheading, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
                  {agentLabel}
                </Text>
                <View style={styles.readyBadge}>
                  <View style={[styles.readyDot, { backgroundColor: colors.idleDot }]} />
                  <Text style={[typeScale.label, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                    Ready
                  </Text>
                </View>
              </View>
              <Text
                style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {folder}
              </Text>
            </View>
          </View>
        </View>

        <Text
          style={[
            typeScale.body,
            { color: colors.inkSecondary, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
          ]}
          maxFontSizeMultiplier={1.3}
        >
          Ready to work. Tap a starter prompt above or message the agent below.
        </Text>

        <View style={[styles.chipsContainer, { gap: spacing.sm }]}>
          {STARTER_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt.label}
              onPress={() => handleSend(prompt.label, [])}
              accessibilityRole="button"
              accessibilityLabel={prompt.label}
              style={[
                styles.promptChip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radius.chip,
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Icon icon={prompt.icon} size={16} color={colors.inkSecondary} />
              <Text style={[typeScale.bodyMedium, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
                {prompt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.canvas }]}
      // edgeToEdgeEnabled=true (Android) breaks windowSoftInputMode="adjustResize" —
      // the OS no longer reliably shrinks the window when the keyboard opens, so
      // KeyboardAvoidingView's own "padding" behavior is needed unconditionally on
      // both platforms (see pig-keyboard-handling; matches SetupScreen,
      // NewSessionSheet, RenameSessionSheet).
      behavior="padding"
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xs },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to sessions"
          style={[styles.backButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
        >
          <Icon icon={ChevronLeft} size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitleGroup}>
          <Text style={[typeScale.heading, { color: colors.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {session?.name ?? 'PiG app build'}
          </Text>
          <Pressable
            testID="session-model-badge"
            onPress={() => setSlashOverlayVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose model"
            style={[
              styles.modelBadge,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[typeScale.caption, { color: colors.inkSecondary, fontSize: 11, fontWeight: '500' }]}>
              {sessionModelBadge}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => navigation.navigate('FileExplorer', { initialPath: session?.folder })}
          accessibilityRole="button"
          accessibilityLabel="Open file explorer"
          style={[styles.folderButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
        >
          <Icon icon={FolderOpen} size={24} color={colors.inkSecondary} />
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TranscriptRow item={item} onOpenAttachment={openAttachment} onOpenFile={openFileLink} onRetrySend={handleRetrySend} />}
        ListEmptyComponent={renderEmptyTranscript}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: spacing.md }}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
      />

      <Composer
        sessionId={sessionId}
        onSend={handleSend}
        onOpenSlash={() => setSlashOverlayVisible(true)}
      />

      <FileViewerSheet file={viewerFile} textContent={viewerContent} onClose={closeViewer} />

      <SlashCommandOverlay
        visible={slashOverlayVisible}
        onClose={() => setSlashOverlayVisible(false)}
        sessionId={sessionId}
        onSelectModel={(m) => {
          userPickedModelRef.current = true;
          setSessionModelBadge(m.name);
        }}
        onSelectCommand={(cmd) => {
          if (cmd.name === '/clear') {
            setMessages([]);
          } else if (cmd.name === '/compact') {
            setMessages((prev) => prev.slice(-2));
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleGroup: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
  },
  modelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  folderButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    marginLeft: -8,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    maxWidth: '85%',
  },
  sendFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentTurn: {
    width: '100%',
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyContainer: {
    flex: 1,
  },
  agentHeaderCard: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  agentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  agentCardMeta: {
    flex: 1,
  },
  agentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipsContainer: {
    width: '100%',
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});

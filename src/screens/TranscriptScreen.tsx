import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
import { ChevronLeft, FolderOpen, Rocket, SquareTerminal } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useFadeSlideIn } from '../theme/motion';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { FileAttachment, TranscriptMessage } from '../types';
import { getCached, appendAndPersist, replaceAll } from '../transcriptCache';
import { useBridge } from '../contexts/BridgeContext';
import { useSessions } from '../contexts/SessionsContext';
import { AgentStatusDot } from '../components/AgentStatusDot';
import { MarkdownBody } from '../components/MarkdownBody';
import { FileAttachmentChip } from '../components/FileAttachmentChip';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';
import { Composer, type ComposerAttachment } from '../components/Composer';
import { TypingIndicator } from '../components/TypingIndicator';

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

const STARTER_PROMPTS = [
  '🔎 Explain this project',
  '📜 Summarize recent git commits',
  '🧪 Run test suite',
  '🛠️ What tasks are open?',
];

interface TranscriptRowProps {
  item: TranscriptMessage;
  onOpenAttachment: (attachment: FileAttachment) => void;
}

function TranscriptRow({ item, onOpenAttachment }: TranscriptRowProps) {
  const { colors, spacing, typeScale } = useTheme();
  const animatedStyle = useFadeSlideIn();

  if (item.role === 'user') {
    return (
      <Animated.View style={[styles.userRow, { paddingHorizontal: spacing.md, marginBottom: spacing.md }, animatedStyle]}>
        <View
          style={[
            styles.userBubble,
            { backgroundColor: colors.accent, borderRadius: 18, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
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
        <Text style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
          {relativeTime(item.timestamp)}
        </Text>
      </Animated.View>
    );
  }

  const status = item.status ?? 'done';
  return (
    <Animated.View style={[styles.agentTurn, { paddingHorizontal: spacing.md, marginBottom: spacing.lg }, animatedStyle]}>
      <View style={[styles.turnHeader, { marginBottom: spacing.xs }]}>
        <Text style={[typeScale.subheading, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
          Agent
        </Text>
        <AgentStatusDot status={status} />
        <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
          {relativeTime(item.timestamp)}
        </Text>
      </View>
      {status === 'error' ? (
        <Text style={[typeScale.body, { color: colors.destructive }]} maxFontSizeMultiplier={1.3}>
          {item.content}
        </Text>
      ) : status === 'streaming' && item.content.trim() === '' ? (
        <TypingIndicator />
      ) : (
        <MarkdownBody content={item.content} />
      )}
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

export default function TranscriptScreen() {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<TranscriptRoute>();
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const { sessions } = useSessions();
  const session = sessions.find((s) => s.id === sessionId);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
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
      setMessages(snapshot.transcript);
      void replaceAll(sessionId, snapshot.transcript);
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

  const handleSend = useCallback(
    (text: string, attachments: ComposerAttachment[], alreadySent = false) => {
      const userMessage: TranscriptMessage = {
        id: `local-msg-${nextMessageId++}`,
        role: 'user',
        timestamp: new Date().toISOString(),
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      const replyId = `local-msg-${nextMessageId++}`;
      const isConnected = Boolean(client && client.getStatus() === 'connected');
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
              key={prompt}
              onPress={() => handleSend(prompt, [])}
              accessibilityRole="button"
              accessibilityLabel={prompt}
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
              <Text style={[typeScale.bodyMedium, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
                {prompt}
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
      // Android's AndroidManifest.xml sets windowSoftInputMode="adjustResize",
      // so the OS already shrinks the window when the keyboard opens —
      // stacking KeyboardAvoidingView's own "padding" behavior on top of that
      // double-compensates and pushes the composer (and its Send button)
      // below the visible viewport. iOS has no such manifest-level resize,
      // so it still needs "padding" here.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
        <Text style={[typeScale.heading, { color: colors.ink, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {session?.name ?? 'PiG app build'}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('FileExplorer')}
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
        renderItem={({ item }) => <TranscriptRow item={item} onOpenAttachment={openAttachment} />}
        ListEmptyComponent={renderEmptyTranscript}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: spacing.md }}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
      />

      <Composer sessionId={sessionId} onSend={handleSend} />

      <FileViewerSheet file={viewerFile} textContent={viewerContent} onClose={closeViewer} />
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
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});

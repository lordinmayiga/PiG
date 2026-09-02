import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ChevronLeft, FolderOpen } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { FileAttachment, TranscriptMessage } from '../types';
import { mockTranscript, mockStreamingReply } from '../fixtures/transcripts';
import { mockFileContents } from '../fixtures/files';
import { getCached, appendAndPersist, replaceAll } from '../transcriptCache';
import { useBridge } from '../contexts/BridgeContext';
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

let nextMessageId = 1000;

export default function TranscriptScreen() {
  const { colors, spacing, typeScale, minTouchTarget } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<TranscriptRoute>();
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { client } = useBridge();

  // Read-through the transcript cache (src/transcriptCache.ts) on mount —
  // instant paint from whatever's cached, per PHASE_5_6_PLAN.md's storage
  // schema ("render cache immediately, then send resync_request").
  //
  // DEV FALLBACK: if the cache is empty AND there's no bridge client to
  // resync against (e.g. USE_MOCK_TRANSPORT off with nothing paired), seed
  // from the fixture transcript so the screen isn't blank in that
  // configuration. Once a client exists, `resync_snapshot` below is the
  // real source of truth and overwrites whatever was seeded/cached.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cached = await getCached(sessionId);
      if (!cached && !client) {
        // Dev-only seed, no-client case only — see comment above.
        await appendAndPersist(sessionId, mockTranscript);
        cached = await getCached(sessionId);
      }
      if (!cancelled) {
        setMessages(cached?.messages ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, client]);

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
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === chunk.message.id);
        const next =
          existingIndex === -1
            ? [...prev, chunk.message]
            : prev.map((m, i) => (i === existingIndex ? chunk.message : m));
        if (chunk.done) void replaceAll(sessionId, next);
        return next;
      });
    });

    return () => {
      unsubscribeResync();
      unsubscribeChunk();
    };
  }, [client, sessionId]);

  const openAttachment = useCallback((attachment: FileAttachment) => {
    setViewerFile(attachmentToViewable(attachment));
    setViewerContent(attachment.kind === 'text' ? mockFileContents[attachment.path] : undefined);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerFile(null);
    setViewerContent(undefined);
  }, []);

  const streamAgentReply = useCallback(
    (replyId: string) => {
      const words = mockStreamingReply.split(' ');
      let i = 0;
      streamTimer.current = setInterval(() => {
        i += 3;
        const chunk = words.slice(0, i).join(' ');
        const done = i >= words.length;
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === replyId ? { ...m, content: chunk, status: done ? ('done' as const) : ('streaming' as const) } : m,
          );
          // Re-sync the cache once the streamed reply settles — until Phase
          // 6's real client lands, this is the only place turn content
          // changes after it was first appended, so a plain append would
          // leave a stale (empty) copy of this message cached.
          if (done) void replaceAll(sessionId, next);
          return next;
        });
        if (done && streamTimer.current) {
          clearInterval(streamTimer.current);
          streamTimer.current = null;
        }
      }, 120);
    },
    [sessionId],
  );

  const handleSend = useCallback(
    (text: string, attachments: ComposerAttachment[]) => {
      const userMessage: TranscriptMessage = {
        id: `local-msg-${nextMessageId++}`,
        role: 'user',
        timestamp: new Date().toISOString(),
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      const replyId = `local-msg-${nextMessageId++}`;
      const agentReply: TranscriptMessage = {
        id: replyId,
        role: 'agent',
        timestamp: new Date().toISOString(),
        status: 'streaming',
        content: '',
      };
      setMessages((prev) => [...prev, userMessage, agentReply]);
      void appendAndPersist(sessionId, [userMessage, agentReply]);
      streamAgentReply(replyId);
    },
    [sessionId, streamAgentReply],
  );

  const renderItem = useCallback(
    ({ item }: { item: TranscriptMessage }) => {
      if (item.role === 'user') {
        return (
          <View style={[styles.userRow, { paddingHorizontal: spacing.md, marginBottom: spacing.md }]}>
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
                  <FileAttachmentChip key={attachment.id} attachment={attachment} onPress={openAttachment} />
                ))}
              </View>
            ) : null}
            <Text style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
              {relativeTime(item.timestamp)}
            </Text>
          </View>
        );
      }

      const status = item.status ?? 'done';
      return (
        <View style={[styles.agentTurn, { paddingHorizontal: spacing.md, marginBottom: spacing.lg }]}>
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
                <FileAttachmentChip key={attachment.id} attachment={attachment} onPress={openAttachment} />
              ))}
            </View>
          ) : null}
        </View>
      );
    },
    [colors, spacing, typeScale, openAttachment],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.canvas }]}
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
        <Text style={[typeScale.heading, { color: colors.ink, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          PiG app build
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
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: spacing.md }}
        keyboardShouldPersistTaps="handled"
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
});

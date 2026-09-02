import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FolderOpen } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { FileAttachment, TranscriptMessage } from '../types';
import { mockTranscript, mockStreamingReply } from '../fixtures/transcripts';
import { mockFileContents } from '../fixtures/files';
import { AgentStatusDot } from '../components/AgentStatusDot';
import { MarkdownBody } from '../components/MarkdownBody';
import { FileAttachmentChip } from '../components/FileAttachmentChip';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';
import { Composer, type ComposerAttachment } from '../components/Composer';
import { TypingIndicator } from '../components/TypingIndicator';

type Nav = NativeStackNavigationProp<SessionsStackParamList, 'Transcript'>;

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
  const [messages, setMessages] = useState<TranscriptMessage[]>(mockTranscript);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const openAttachment = useCallback((attachment: FileAttachment) => {
    setViewerFile(attachmentToViewable(attachment));
    setViewerContent(attachment.kind === 'text' ? mockFileContents[attachment.path] : undefined);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerFile(null);
    setViewerContent(undefined);
  }, []);

  const streamAgentReply = useCallback((replyId: string) => {
    const words = mockStreamingReply.split(' ');
    let i = 0;
    streamTimer.current = setInterval(() => {
      i += 3;
      const chunk = words.slice(0, i).join(' ');
      const done = i >= words.length;
      setMessages((prev) =>
        prev.map((m) => (m.id === replyId ? { ...m, content: chunk, status: done ? 'done' : 'streaming' } : m)),
      );
      if (done && streamTimer.current) {
        clearInterval(streamTimer.current);
        streamTimer.current = null;
      }
    }, 120);
  }, []);

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
      streamAgentReply(replyId);
    },
    [streamAgentReply],
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }]}>
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
      />

      <Composer onSend={handleSend} />

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

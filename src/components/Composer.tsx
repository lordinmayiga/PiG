import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Mic, Paperclip, Send, X } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import type { FileAttachment } from '../types';

export interface ComposerAttachment extends FileAttachment {
  /** Device-local URI for a just-picked image, used for the lightbox preview. */
  uri?: string;
}

interface ComposerProps {
  onSend: (text: string, attachments: ComposerAttachment[]) => void;
}

function kindForMimeType(mimeType: string): FileAttachment['kind'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'other';
}

let nextLocalId = 1;

/**
 * Composer per SPEC.md §3/§6: purely local state until send — no network
 * calls while typing. Attach (photo/camera vs. file), a stub mic button
 * (dictation wiring is out of scope here), and a send button gated on
 * having text or at least one attachment.
 */
export function Composer({ onSend }: ComposerProps) {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);

  const canSend = text.trim().length > 0 || attachments.length > 0;

  const addAttachment = (attachment: ComposerAttachment) => {
    setAttachments((prev) => [...prev, attachment]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is needed to attach an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    addAttachment({
      id: `local-${nextLocalId++}`,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'image.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? 0,
      path: asset.uri,
      kind: 'image',
      uri: asset.uri,
    });
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'application/octet-stream';
    addAttachment({
      id: `local-${nextLocalId++}`,
      name: asset.name,
      mimeType,
      sizeBytes: asset.size ?? 0,
      path: asset.uri,
      kind: kindForMimeType(mimeType),
      uri: mimeType.startsWith('image/') ? asset.uri : undefined,
    });
  };

  const handleAttachPress = () => {
    Alert.alert('Attach', undefined, [
      { text: 'Photo', onPress: handlePickImage },
      { text: 'File', onPress: handlePickFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.border, padding: spacing.sm }]}>
      {attachments.length > 0 ? (
        <View style={[styles.attachmentRow, { gap: spacing.xs, marginBottom: spacing.xs }]}>
          {attachments.map((attachment) => (
            <View
              key={attachment.id}
              style={[styles.pendingChip, { backgroundColor: colors.neutral[100], borderRadius: radius.chip, paddingHorizontal: spacing.xs }]}
            >
              <Text style={[typeScale.caption, { color: colors.ink, maxWidth: 120 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {attachment.name}
              </Text>
              <Pressable
                onPress={() => removeAttachment(attachment.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${attachment.name}`}
                hitSlop={8}
                style={{ marginLeft: spacing.xxs }}
              >
                <Icon icon={X} size={16} color={colors.inkSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <Pressable
          onPress={handleAttachPress}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo or file"
          style={[styles.iconButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
        >
          <Icon icon={Paperclip} size={24} color={colors.inkSecondary} />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message the agent…"
          placeholderTextColor={colors.inkPlaceholder}
          multiline
          style={[
            styles.input,
            typeScale.body,
            { color: colors.ink, backgroundColor: colors.canvas, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
          ]}
          maxFontSizeMultiplier={1.3}
        />

        <Pressable
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel="Dictate (not yet available)"
          style={[styles.iconButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
        >
          <Icon icon={Mic} size={24} color={colors.inkSecondary} />
        </Pressable>

        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[
            styles.sendButton,
            {
              backgroundColor: canSend ? colors.accent : colors.neutral[200],
              borderRadius: radius.pill,
              minWidth: minTouchTarget,
              minHeight: minTouchTarget,
            },
          ]}
        >
          <Icon icon={Send} size={20} color={canSend ? colors.onAccent : colors.inkPlaceholder} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

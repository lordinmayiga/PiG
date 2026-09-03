import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Mic, Plus, Send, X } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { sendRouteInput, classifyLocally, type RouteInputAction } from '../network/routeInput';
import { getBridgeClient } from '../network/bridgeConnection';
import type { FileAttachment } from '../types';

export interface ComposerAttachment extends FileAttachment {
  /** Device-local URI for a just-picked image, used for the lightbox preview. */
  uri?: string;
}

interface ComposerProps {
  /** The session this composer is submitting into — threaded through to
   * `sendRouteInput`'s `route_input` envelope so the backend/mock knows
   * which session's turn this is. Optional only for call sites that don't
   * have a real session yet (none currently); omitting it sends an empty
   * sessionId, which the backend would reject as malformed once it's real. */
  sessionId?: string;
  /** Called with the cleaned-up prompt text once `/route-input` classifies a submission as an agent prompt. */
  onSend: (text: string, attachments: ComposerAttachment[]) => void;
  /**
   * Called when `/route-input` classifies a submission as an environment
   * command (kill/new/switch session, etc), after the user has confirmed it
   * if `requiresConfirm` was set. Optional — screens that don't yet handle
   * routed actions (e.g. the current fixture-driven demo) can omit it, in
   * which case Composer falls back to `onSend` so the submission still shows
   * up somewhere instead of silently vanishing.
   */
  onAction?: (action: RouteInputAction) => void;
}

function kindForMimeType(mimeType: string): FileAttachment['kind'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'other';
}

let nextLocalId = 1;

/**
 * Composer per SPEC.md §3/§6: purely local state until send — no network
 * calls while typing. Attach (photo/camera vs. file) and a stub mic button
 * (dictation wiring is out of scope here) share the trailing slot with Send:
 * mic shows while the composer is empty, Send takes its place once there's
 * text or an attachment — matches the reference composer design, and means
 * there's never a dead, permanently-disabled Send button on screen.
 *
 * Floating rounded card, not a flush full-width bar — see pig-layout-spacing
 * (radius.pill is the named "composer pill" token) and pig-color-system
 * (colors.card as the nested surface on colors.canvas, in both modes).
 *
 * Keyboard handling per pig-keyboard-handling: the bottom safe-area inset
 * collapses to 0 while the keyboard is visible instead of stacking on top of
 * the keyboard's own height (would otherwise leave a dead gap above it).
 */
export function Composer({ sessionId, onSend, onAction }: ComposerProps) {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
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

  const runAction = (action: RouteInputAction, submittedText: string, submittedAttachments: ComposerAttachment[]) => {
    if (onAction) {
      onAction(action);
    } else {
      // No screen-level handler wired up yet (Phase 6C's action_confirm
      // send isn't in place) — fall back to the plain prompt path so the
      // submission still surfaces instead of disappearing silently.
      onSend(submittedText, submittedAttachments);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    const submittedText = text.trim();
    const submittedAttachments = attachments;
    // Clear the composer immediately — routing happens against a snapshot
    // of what was submitted, per SPEC §3/§6.
    setText('');
    setAttachments([]);

    try {
      const result = await sendRouteInput(submittedText, submittedAttachments, sessionId ?? '');
      if (result.kind === 'action') {
        if (result.requiresConfirm) {
          Alert.alert(result.action.summary || 'Confirm action', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Confirm',
              style: 'destructive',
              onPress: () => {
                const client = getBridgeClient();
                const actionId = result.action.params?.actionId as string | undefined;
                if (client && actionId) {
                  client.sendActionConfirm({ actionId, confirmed: true }, sessionId);
                }
                runAction(result.action, submittedText, submittedAttachments);
              },
            },
          ]);
        } else {
          runAction(result.action, submittedText, submittedAttachments);
        }
        return;
      }

      // Normal prompt: post to the screen
      onSend(result.cleanedText || submittedText, submittedAttachments);
    } catch (err) {
      console.error('[Composer] Failed to route input:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send input';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  };

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: colors.canvas,
          paddingHorizontal: spacing.sm,
          paddingTop: spacing.xs,
          // Collapse the safe-area inset while the keyboard is up instead of
          // stacking it on top of the keyboard's own height.
          paddingBottom: spacing.xs + (keyboardVisible ? 0 : insets.bottom),
        },
      ]}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.pill, padding: spacing.xs },
        ]}
      >
        {attachments.length > 0 ? (
          <View style={[styles.attachmentRow, { gap: spacing.xs, paddingHorizontal: spacing.xs, marginBottom: spacing.xxs }]}>
            {attachments.map((attachment) => (
              <View
                key={attachment.id}
                style={[
                  styles.pendingChip,
                  {
                    backgroundColor: colors.canvas,
                    borderColor: colors.border,
                    borderRadius: radius.chip,
                    paddingHorizontal: spacing.xs,
                  },
                ]}
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

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message the agent…"
          placeholderTextColor={colors.inkPlaceholder}
          multiline
          style={[
            styles.input,
            typeScale.body,
            { color: colors.ink, paddingHorizontal: spacing.xs },
          ]}
          maxFontSizeMultiplier={1.3}
        />

        <View style={[styles.actionRow, { paddingHorizontal: spacing.xxs }]}>
          <Pressable
            onPress={handleAttachPress}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo or file"
            style={[styles.iconButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
          >
            <Icon icon={Plus} size={20} color={colors.inkSecondary} />
          </Pressable>

          {canSend ? (
            <Pressable
              onPress={handleSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={[
                styles.sendButton,
                { backgroundColor: colors.accent, borderRadius: radius.pill, minWidth: minTouchTarget, minHeight: minTouchTarget },
              ]}
            >
              <Icon icon={Send} size={20} color={colors.onAccent} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {}}
              accessibilityRole="button"
              accessibilityLabel="Dictate (not yet available)"
              style={[styles.iconButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
            >
              <Icon icon={Mic} size={20} color={colors.inkSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {},
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    maxHeight: 120,
    minHeight: 36,
    paddingVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

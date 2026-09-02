import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import type { Session } from '../../types';

export interface RenameSessionSheetProps {
  session: Session | null;
  onClose: () => void;
  onSave: (session: Session, newName: string) => void;
}

export default function RenameSessionSheet({ session, onClose, onSave }: RenameSessionSheetProps) {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Per pig-keyboard-handling: focus after the sheet's slide-in animation
  // instead of a bare `autoFocus`, which fires the keyboard at the same
  // instant the sheet starts animating and fights that transition. Modal's
  // `onShow` fires as the animation starts, so wait it out first — 300ms
  // matches RN's default Modal slide duration.
  const handleShow = () => {
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  // Reset the draft each time the sheet transitions from closed to open —
  // setState during render rather than in an effect, per React's
  // "adjusting state when a prop changes" pattern.
  const isOpen = session !== null;
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && session) setName(session.name);
  }

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && session !== null;

  const handleSave = () => {
    if (!session || !canSave) return;
    onSave(session, trimmed);
  };

  return (
    <Modal visible={session !== null} transparent animationType="slide" onRequestClose={onClose} onShow={handleShow}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityLabel="Close rename sheet"
        accessibilityRole="button"
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[
          styles.sheet,
          {
            backgroundColor: colors.elevated,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            padding: spacing.lg,
            paddingBottom: spacing.lg + insets.bottom,
          },
        ]}
      >
        <Text style={[typeScale.heading, { color: colors.ink }]}>Rename session</Text>

        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholder="Session name"
          placeholderTextColor={colors.inkPlaceholder}
          style={[
            typeScale.body,
            styles.input,
            {
              color: colors.ink,
              borderColor: colors.border,
              borderRadius: radius.chip,
              paddingHorizontal: spacing.sm,
              minHeight: minTouchTarget,
              marginTop: spacing.md,
            },
          ]}
        />

        <View style={[styles.actionRow, { marginTop: spacing.lg }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={[styles.actionButton, { minHeight: minTouchTarget }]}
          >
            <Text style={[typeScale.bodyMedium, { color: colors.ink }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save"
            style={[
              styles.actionButton,
              {
                backgroundColor: canSave ? colors.accent : colors.border,
                borderRadius: radius.pill,
                minHeight: minTouchTarget,
              },
            ]}
          >
            <Text style={[typeScale.bodyMedium, { color: canSave ? colors.onAccent : colors.inkPlaceholder }]}>
              Save
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pencil, Trash2 } from 'lucide-react-native';

import { Icon, useTheme } from '../../theme';
import type { Session } from '../../types';

export interface SessionActionMenuProps {
  session: Session | null;
  onClose: () => void;
  onRename: (session: Session) => void;
  onKill: (session: Session) => void;
}

/** Long-press / overflow-button action sheet for a session card. */
export default function SessionActionMenu({ session, onClose, onRename, onKill }: SessionActionMenuProps) {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={session !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityLabel="Close menu"
        accessibilityRole="button"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.elevated,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm + insets.bottom,
            paddingHorizontal: spacing.lg,
          },
        ]}
      >
        {session && (
          <Text style={[typeScale.label, { color: colors.inkSecondary, marginBottom: spacing.xs }]} numberOfLines={1}>
            {session.name}
          </Text>
        )}

        <Pressable
          onPress={() => session && onRename(session)}
          accessibilityRole="button"
          accessibilityLabel="Rename session"
          style={[styles.row, { minHeight: minTouchTarget }]}
        >
          <Icon icon={Pencil} size={20} color={colors.ink} />
          <Text style={[typeScale.body, { color: colors.ink, marginLeft: spacing.sm }]}>Rename</Text>
        </Pressable>

        <Pressable
          onPress={() => session && onKill(session)}
          accessibilityRole="button"
          accessibilityLabel="Kill session"
          style={[styles.row, { minHeight: minTouchTarget }]}
        >
          <Icon icon={Trash2} size={20} color={colors.destructive} />
          <Text style={[typeScale.bodyMedium, { color: colors.destructive, marginLeft: spacing.sm }]}>
            Kill session
          </Text>
        </Pressable>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.row, { minHeight: minTouchTarget, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
        >
          <Text style={[typeScale.body, { color: colors.inkSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

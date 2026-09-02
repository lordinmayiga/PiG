import { Pressable, StyleSheet, Text, View } from 'react-native';
import { File, FileText, Image as ImageIcon } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import type { FileAttachment } from '../types';

interface FileAttachmentChipProps {
  attachment: FileAttachment;
  onPress: (attachment: FileAttachment) => void;
}

function iconFor(kind: FileAttachment['kind']) {
  switch (kind) {
    case 'image':
      return ImageIcon;
    case 'text':
      return FileText;
    default:
      return File;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inline transcript chip for a sent or agent-surfaced file — tap opens FileViewerSheet. */
export function FileAttachmentChip({ attachment, onPress }: FileAttachmentChipProps) {
  const { colors, spacing, radius, typeScale } = useTheme();

  return (
    <Pressable
      onPress={() => onPress(attachment)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name}`}
      style={[styles.chip, { backgroundColor: colors.neutral[100], borderRadius: radius.chip, paddingHorizontal: spacing.sm }]}
    >
      <Icon icon={iconFor(attachment.kind)} size={16} color={colors.inkSecondary} />
      <View style={{ marginLeft: spacing.xxs, flexShrink: 1 }}>
        <Text style={[typeScale.label, { color: colors.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {attachment.name}
        </Text>
        <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
          {formatBytes(attachment.sizeBytes)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    alignSelf: 'flex-start',
    maxWidth: 240,
  },
});

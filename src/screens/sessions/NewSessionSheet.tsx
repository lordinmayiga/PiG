import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import ReanimatedAnimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rocket, SquareTerminal } from 'lucide-react-native';

import { Icon, useTheme } from '../../theme';
import { useSheetMotion } from '../../theme/motion';
import { useBridge } from '../../contexts/BridgeContext';
import type { AgentKind } from '../../types';

const agentOptions: { kind: AgentKind; label: string; icon: typeof SquareTerminal }[] = [
  { kind: 'claude-code', label: 'Claude Code', icon: SquareTerminal },
  { kind: 'antigravity', label: 'Antigravity', icon: Rocket },
];

function folderName(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  const last = trimmed.split('/').pop();
  return last && last.length > 0 ? last : trimmed;
}

export interface NewSessionDraft {
  name: string;
  agent: AgentKind;
  folder: string;
}

export interface NewSessionSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (draft: NewSessionDraft) => void;
}

export default function NewSessionSheet({ visible, onClose, onCreate }: NewSessionSheetProps) {
  const { colors, spacing, radius, typeScale, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const { client } = useBridge();
  const { mounted, backdropStyle, sheetStyle } = useSheetMotion(visible);

  const [agent, setAgent] = useState<AgentKind>('claude-code');
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);

  useEffect(() => {
    if (!visible || !client) return;
    let cancelled = false;
    client
      .fsList('/root/projects')
      .catch(() => client.fsList('/root'))
      .then((entries) => {
        if (cancelled) return;
        const folders = entries
          .filter((e) => e.type === 'folder')
          .map((e) => e.path);
        if (folders.length > 0) {
          setRecentFolders(folders);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, client]);

  // Reset the draft each time the sheet transitions from closed to open —
  // React's "adjusting state when a prop changes" pattern (setState during
  // render, not in an effect): https://react.dev/learn/you-might-not-need-an-effect
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setAgent('claude-code');
      setFolder('');
      setName('');
      setNameTouched(false);
    }
  }

  const handleFolderChange = (value: string) => {
    setFolder(value);
    if (!nameTouched) setName(folderName(value));
  };

  const handlePickFolder = (path: string) => {
    setFolder(path);
    if (!nameTouched) setName(folderName(path));
  };

  const canCreate = folder.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({
      name: name.trim().length > 0 ? name.trim() : folderName(folder),
      agent,
      folder: folder.trim(),
    });
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <ReanimatedAnimated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityLabel="Close new session sheet"
          accessibilityRole="button"
        />
      </ReanimatedAnimated.View>
      <ReanimatedAnimated.View style={[styles.sheet, sheetStyle]}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{
            backgroundColor: colors.elevated,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            padding: spacing.lg,
            paddingBottom: spacing.lg + insets.bottom,
          }}
        >
        <Text style={[typeScale.heading, { color: colors.ink }]}>New session</Text>

        <Text style={[typeScale.label, { color: colors.inkSecondary, marginTop: spacing.lg }]}>Agent</Text>
        <View style={[styles.segmentRow, { marginTop: spacing.xs }]}>
          {agentOptions.map((option) => {
            const selected = option.kind === agent;
            return (
              <Pressable
                key={option.kind}
                onPress={() => setAgent(option.kind)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                style={[
                  styles.segmentOption,
                  {
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.accent : 'transparent',
                    borderRadius: radius.chip,
                    paddingVertical: spacing.sm,
                    minHeight: minTouchTarget,
                  },
                ]}
              >
                <Icon icon={option.icon} size={20} color={selected ? colors.onAccent : colors.inkSecondary} />
                <Text
                  style={[
                    typeScale.bodyMedium,
                    { color: selected ? colors.onAccent : colors.ink, marginLeft: spacing.xs },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[typeScale.label, { color: colors.inkSecondary, marginTop: spacing.lg }]}>
          Starting folder
        </Text>
        <TextInput
          value={folder}
          onChangeText={handleFolderChange}
          placeholder="/root/projects/my-app"
          placeholderTextColor={colors.inkPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            typeScale.body,
            styles.input,
            {
              color: colors.ink,
              borderColor: colors.border,
              borderRadius: radius.chip,
              paddingHorizontal: spacing.sm,
              minHeight: minTouchTarget,
              marginTop: spacing.xs,
            },
          ]}
        />

        {recentFolders.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: spacing.xs }}
            contentContainerStyle={styles.chipRow}
          >
            {recentFolders.map((path) => (
              <Pressable
                key={path}
                onPress={() => handlePickFolder(path)}
                accessibilityRole="button"
                accessibilityLabel={`Use folder ${path}`}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.border,
                    borderRadius: radius.chip,
                    paddingHorizontal: spacing.sm,
                    marginRight: spacing.xs,
                  },
                ]}
              >
                <Text style={[typeScale.caption, { color: colors.inkSecondary }]} numberOfLines={1}>
                  {path}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={[typeScale.label, { color: colors.inkSecondary, marginTop: spacing.lg }]}>
          Session name
        </Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameTouched(true);
          }}
          placeholder="New session"
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
              marginTop: spacing.xs,
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
            onPress={handleCreate}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Start session"
            style={[
              styles.actionButton,
              styles.primaryButton,
              {
                backgroundColor: canCreate ? colors.accent : colors.border,
                borderRadius: radius.pill,
                minHeight: minTouchTarget,
              },
            ]}
          >
            <Text style={[typeScale.bodyMedium, { color: canCreate ? colors.onAccent : colors.inkPlaceholder }]}>
              Start session
            </Text>
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      </ReanimatedAnimated.View>
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
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  primaryButton: {},
});

import { useState } from 'react';
import { KeyRound, Lock, Server } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsRow } from '../components/SettingsRow';
import { mockOpenRouterSettings, mockVpsConnection } from '../fixtures/settings';
import { useTheme } from '../theme';
import type { OpenRouterSettings } from '../types';

/**
 * Settings screen (SPEC.md §3.5, §7): VPS connection details, OpenRouter
 * key (masked — the real key is never held client-side, see §7), and a
 * lock/security section.
 *
 * ASSUMPTION (SPEC.md doesn't detail the lock/security section beyond
 * naming it): modeled as a single "Require unlock to open app" toggle that
 * would gate the app behind the device's own screen lock (PIN/pattern/
 * biometrics via a future expo-local-authentication check) rather than a
 * PiG-specific PIN — simplest option that still meets "lock/security" and
 * needs no separate credential to manage. Purely a local UI stub here; no
 * real gating is wired up yet.
 */
export default function SettingsScreen() {
  const { colors, spacing, radius, typeScale, screenMargin, maxFontScale, minTouchTarget } = useTheme();

  const vps = mockVpsConnection;
  const [openRouter, setOpenRouter] = useState<OpenRouterSettings>(mockOpenRouterSettings);
  const [requireUnlock, setRequireUnlock] = useState(false);

  const [isEditingKey, setIsEditingKey] = useState(false);
  // Transient plaintext input only — cleared the moment Save mocks the
  // round trip. Never merged into persisted state; only the masked
  // `keySuffix` is kept, matching §7's "key held server-side only" rule.
  const [keyDraft, setKeyDraft] = useState('');

  const openKeyEditor = () => {
    setKeyDraft('');
    setIsEditingKey(true);
  };

  const cancelKeyEdit = () => {
    setKeyDraft('');
    setIsEditingKey(false);
  };

  const saveKeyEdit = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      Alert.alert('Key required', 'Paste a key before saving, or cancel.');
      return;
    }
    // Mock: a real save would POST the plaintext key to the VPS backend and
    // only ever get a masked suffix back. Nothing but that suffix is kept.
    setOpenRouter({ hasKey: true, keySuffix: trimmed.slice(-4) });
    setKeyDraft('');
    setIsEditingKey(false);
  };

  const vpsStatus = vps.paired
    ? `Paired · last connected ${formatRelativeTime(vps.lastConnectedAt)}`
    : 'Not paired';

  const keyValue = openRouter.hasKey && openRouter.keySuffix ? `Ending in ${openRouter.keySuffix}` : 'Not set';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: screenMargin, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[typeScale.title, { color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.lg }]}
        >
          Settings
        </Text>

        <SectionHeader label="VPS connection" />
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, borderColor: colors.border }]}>
          <SettingsRow icon={Server} label={vps.host} value={vpsStatus} />
        </View>

        <SectionHeader label="OpenRouter" />
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, borderColor: colors.border }]}>
          <SettingsRow
            icon={KeyRound}
            label="API key"
            value={keyValue}
            onPress={isEditingKey ? undefined : openKeyEditor}
            trailing={
              isEditingKey ? undefined : (
                <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.label, { color: colors.accent }]}>
                  {openRouter.hasKey ? 'Update' : 'Add'}
                </Text>
              )
            }
          />
          {isEditingKey ? (
            <View style={[styles.editor, { paddingBottom: spacing.sm, gap: spacing.xs }]}>
              <TextInput
                value={keyDraft}
                onChangeText={setKeyDraft}
                placeholder="Paste your OpenRouter key"
                placeholderTextColor={colors.inkPlaceholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxFontSizeMultiplier={maxFontScale}
                style={[
                  typeScale.body,
                  {
                    color: colors.ink,
                    backgroundColor: colors.canvas,
                    borderColor: colors.border,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: radius.chip,
                    paddingHorizontal: spacing.sm,
                    minHeight: minTouchTarget,
                  },
                ]}
              />
              <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.caption, { color: colors.inkSecondary }]}>
                Held on your VPS only — this app never stores or displays the full key.
              </Text>
              <View style={[styles.editorActions, { gap: spacing.sm }]}>
                <Pressable
                  onPress={cancelKeyEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  style={({ pressed }) => [
                    styles.editorButton,
                    { minHeight: minTouchTarget, borderRadius: radius.pill, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.label, { color: colors.inkSecondary }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={saveKeyEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Save key"
                  style={({ pressed }) => [
                    styles.editorButton,
                    {
                      minHeight: minTouchTarget,
                      borderRadius: radius.pill,
                      backgroundColor: colors.accent,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.label, { color: colors.onAccent }]}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <SectionHeader label="Security" />
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, borderColor: colors.border }]}>
          <SettingsRow
            icon={Lock}
            label="Require unlock to open app"
            trailing={
              <Switch
                value={requireUnlock}
                onValueChange={setRequireUnlock}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.onAccent}
                accessibilityLabel="Require unlock to open app"
              />
            }
          />
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[
              typeScale.caption,
              { color: colors.inkSecondary, paddingBottom: spacing.sm },
            ]}
          >
            Uses your device&apos;s screen lock (PIN, pattern, or biometrics) before PiG opens.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { colors, spacing, typeScale, maxFontScale, fontFamily } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale}
      style={[
        typeScale.label,
        {
          color: colors.inkSecondary,
          fontFamily: fontFamily.semiBold,
          marginBottom: spacing.xs,
          marginTop: spacing.lg,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        },
      ]}
    >
      {label}
    </Text>
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  editor: {
    paddingTop: 0,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  editorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});

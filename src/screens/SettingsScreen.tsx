import { useEffect, useState } from 'react';
import { KeyRound, Lock, LogOut, Moon, Server, Smartphone, Sun } from 'lucide-react-native';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsRow } from '../components/SettingsRow';
import { mockOpenRouterSettings } from '../fixtures/settings';
import { clearBridgeCredentials, loadBridgeCredentials, type BridgeCredentials } from '../secureStorage';
import { loadUseRealBackend, saveUseRealBackend } from '../storage';
import { Icon, useTheme, useThemeMode, type ThemePreference } from '../theme';
import type { OpenRouterSettings } from '../types';

/** Last 4 chars only, never the full token — matches the OpenRouter key's masking. */
function maskToken(token: string): string {
  const tail = token.slice(-4);
  return tail ? `Paired · token ending in ${tail}` : 'Paired';
}

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Smartphone },
];

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
  const { preference, setPreference } = useThemeMode();

  // null = still loading from secure storage; the safe fallback if the read
  // fails is "not paired" (see secureStorage.ts), same as everywhere else.
  const [credentials, setCredentials] = useState<BridgeCredentials | null>(null);
  const [openRouter, setOpenRouter] = useState<OpenRouterSettings>(mockOpenRouterSettings);
  const [requireUnlock, setRequireUnlock] = useState(false);
  // Dev toggle (PHASE_7_REAL_BACKEND_PLAN.md step 1): real VPS backend vs.
  // in-process mock. Read once from storage, applied at next BridgeContext
  // connect (see bridgeConnection.ts) — flipping it doesn't live-swap the
  // active connection, hence the restart prompt in handleToggleRealBackend.
  const [useRealBackend, setUseRealBackend] = useState(false);

  useEffect(() => {
    loadBridgeCredentials().then(setCredentials);
    loadUseRealBackend().then(setUseRealBackend);
  }, []);

  const handleToggleRealBackend = (value: boolean) => {
    setUseRealBackend(value);
    void saveUseRealBackend(value);
    Alert.alert(
      'Restart required',
      value
        ? 'Close and reopen PiG to connect to your VPS backend.'
        : 'Close and reopen PiG to switch back to the mock backend.',
    );
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect from VPS?', "You'll need to pair again to reconnect.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearBridgeCredentials();
          setCredentials(null);
          // RootNavigator listens for this change and swaps back to Setup
          // on its own — no direct navigation call needed here.
        },
      },
    ]);
  };

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

  const vpsStatus = credentials ? maskToken(credentials.token) : 'Not paired';

  const keyValue = openRouter.hasKey && openRouter.keySuffix ? `Ending in ${openRouter.keySuffix}` : 'Not set';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: screenMargin, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[typeScale.title, { color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.lg }]}
        >
          Settings
        </Text>

        <SectionHeader label="Appearance" />
        <View
          style={[
            styles.segmented,
            { backgroundColor: colors.canvas, borderColor: colors.border, borderRadius: radius.pill, padding: 3, gap: 3 },
          ]}
        >
          {APPEARANCE_OPTIONS.map((option) => {
            const isActive = preference === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPreference(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${option.label} appearance`}
                style={({ pressed }) => [
                  styles.segment,
                  {
                    minHeight: minTouchTarget - 8,
                    borderRadius: radius.pill,
                    backgroundColor: isActive ? colors.accent : 'transparent',
                    opacity: pressed && !isActive ? 0.6 : 1,
                    gap: spacing.xxs,
                  },
                ]}
              >
                <Icon icon={option.icon} size={16} color={isActive ? colors.onAccent : colors.inkSecondary} />
                <Text
                  maxFontSizeMultiplier={maxFontScale}
                  style={[typeScale.label, { color: isActive ? colors.onAccent : colors.inkSecondary }]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader label="VPS connection" />
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.card, borderColor: colors.border }]}>
          <SettingsRow icon={Server} label={credentials?.host ?? 'No VPS paired'} value={vpsStatus} />
          {credentials ? (
            <SettingsRow icon={LogOut} label="Disconnect" onPress={handleDisconnect} />
          ) : null}
          <SettingsRow
            icon={Server}
            label="Use real VPS backend"
            trailing={
              <Switch
                value={useRealBackend}
                onValueChange={handleToggleRealBackend}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.onAccent}
                accessibilityLabel="Use real VPS backend"
              />
            }
          />
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[typeScale.caption, { color: colors.inkSecondary, paddingBottom: spacing.sm }]}
          >
            Dev toggle — off talks to the in-app mock, on connects to the paired VPS. Takes effect on next restart.
          </Text>
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
      </KeyboardAvoidingView>
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
  segmented: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

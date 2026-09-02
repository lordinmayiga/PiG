import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveBridgeCredentials } from '../secureStorage';
import { useTheme } from '../theme';
import ConnectStep from './setup/ConnectStep';
import ConnectingStep from './setup/ConnectingStep';
import ResultStep from './setup/ResultStep';
import OpenRouterStep from './setup/OpenRouterStep';
import { emptyConnectForm, resolveOutcome, type ConnectFormState, type ConnectMode, type ConnectOutcome, type SetupStep } from './setup/types';

/** Simulated pairing round-trip latency (no real network — Phase 6 wires the real one). */
const MOCK_CONNECT_DELAY_MS = 1500;

interface SetupScreenProps {
  /**
   * Called once the local Setup flow finishes (pairing succeeded, and the
   * optional OpenRouter step was either saved or skipped). RootNavigator
   * owns what happens next — flipping from Setup to the Tab shell — so
   * this stays a plain callback rather than SetupScreen reaching into
   * navigation state itself.
   */
  onSetupComplete: () => void;
}

export default function SetupScreen({ onSetupComplete }: SetupScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<SetupStep>('connect');
  const [mode, setMode] = useState<ConnectMode>('scan');
  const [form, setForm] = useState<ConnectFormState>(emptyConnectForm);
  const [tokenPanelExpanded, setTokenPanelExpanded] = useState(false);
  const [forcedOutcome, setForcedOutcome] = useState<ConnectOutcome | null>(null);
  const [outcome, setOutcome] = useState<ConnectOutcome>('success');

  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (connectTimer.current) clearTimeout(connectTimer.current);
    };
  }, []);

  const handleSubmit = () => {
    setStep('connecting');
    const resolved = resolveOutcome(form, forcedOutcome);
    connectTimer.current = setTimeout(() => {
      if (resolved === 'success') {
        // No real handshake yet (Phase 6) — but the pairing "succeeded" per
        // the mock outcome, so persist what the user typed as if it were
        // the bridge-issued credentials. Fire-and-forget: a failed write is
        // best-effort (see secureStorage.ts) and just leaves Setup showing
        // again next launch, the safe fallback.
        saveBridgeCredentials({ host: form.host.trim(), token: form.token.trim() });
      }
      setOutcome(resolved);
      setStep(resolved === 'success' ? 'success' : 'error');
    }, MOCK_CONNECT_DELAY_MS);
  };

  const handleTryAgain = () => {
    // Form state (host/token) is preserved — only the step changes back.
    setStep('connect');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior="padding"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          {step === 'connect' && (
            <ConnectStep
              mode={mode}
              onModeChange={setMode}
              form={form}
              onFormChange={setForm}
              tokenPanelExpanded={tokenPanelExpanded}
              onToggleTokenPanel={() => setTokenPanelExpanded((expanded) => !expanded)}
              forcedOutcome={forcedOutcome}
              onForcedOutcomeChange={setForcedOutcome}
              onSubmit={handleSubmit}
            />
          )}

          {step === 'connecting' && <ConnectingStep />}

          {(step === 'success' || step === 'error') && (
            <ResultStep
              outcome={outcome}
              host={form.host.trim()}
              onContinue={() => setStep('openrouter')}
              onTryAgain={handleTryAgain}
            />
          )}

          {step === 'openrouter' && <OpenRouterStep onDone={() => onSetupComplete()} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});

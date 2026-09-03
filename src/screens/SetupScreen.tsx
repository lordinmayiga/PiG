import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadBridgeCredentials, saveBridgeCredentials } from '../secureStorage';
import { saveOpenRouterKey } from '../storage';
import { useTheme } from '../theme';
import { useCrossFade } from '../theme/motion';
import ConnectStep from './setup/ConnectStep';
import ConnectingStep from './setup/ConnectingStep';
import ResultStep from './setup/ResultStep';
import OpenRouterStep from './setup/OpenRouterStep';
import { emptyConnectForm, resolveOutcome, type ConnectFormState, type ConnectMode, type ConnectOutcome, type SetupStep } from './setup/types';

/** Simulated pairing round-trip latency (no real network — Phase 6 wires the real one). */
const MOCK_CONNECT_DELAY_MS = 1500;
/** How long the checkmark-ack state holds on screen before handing off to ResultStep. */
const CONNECT_ACK_HOLD_MS = 420;

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
  const [connectAck, setConnectAck] = useState(false);

  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (connectTimer.current) clearTimeout(connectTimer.current);
      if (ackTimer.current) clearTimeout(ackTimer.current);
    };
  }, []);

  const handleSubmit = (overrideForm?: ConnectFormState) => {
    const hasValidOverride = Boolean(
      overrideForm &&
      typeof overrideForm === 'object' &&
      typeof overrideForm.host === 'string' &&
      typeof overrideForm.token === 'string'
    );
    const activeForm = hasValidOverride && overrideForm ? overrideForm : form;
    if (hasValidOverride && overrideForm) {
      setForm(overrideForm);
    }
    setStep('connecting');
    setConnectAck(false);
    const resolved = resolveOutcome(activeForm, forcedOutcome);
    connectTimer.current = setTimeout(async () => {
      if (resolved === 'success') {
        // Persist bridge credentials. Fallback to mock values if empty (e.g. forced success in dev)
        const hostToSave = (activeForm.host ?? '').trim() || '198.51.100.23:8443';
        const tokenToSave = (activeForm.token ?? '').trim() || 'a1b2c3d4e5f6';
        await saveBridgeCredentials({ host: hostToSave, token: tokenToSave });
      }
      setOutcome(resolved);
      if (resolved === 'success') {
        // Briefly show the checkmark bounce acknowledging the handshake before handing off to ResultStep.
        setConnectAck(true);
        ackTimer.current = setTimeout(() => {
          setStep('success');
          setConnectAck(false);
        }, CONNECT_ACK_HOLD_MS);
      } else {
        setStep('error');
      }
    }, MOCK_CONNECT_DELAY_MS);
  };

  const handleOpenRouterDone = async (apiKey: string | undefined) => {
    if (apiKey?.trim()) {
      await saveOpenRouterKey(apiKey.trim());
    }
    // Ensure credentials exist before signaling completion
    const current = await loadBridgeCredentials();
    if (!current) {
      const hostToSave = form.host.trim() || '198.51.100.23:8443';
      const tokenToSave = form.token.trim() || 'a1b2c3d4e5f6';
      await saveBridgeCredentials({ host: hostToSave, token: tokenToSave });
    }
    onSetupComplete();
  };

  // Cross-fades the whole step area (connect -> connecting -> result/openrouter).
  const crossFadeStyle = useCrossFade(step);

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
        <Animated.View style={[{ width: '100%', maxWidth: 420, alignSelf: 'center' }, crossFadeStyle]}>
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

          {step === 'connecting' && <ConnectingStep ack={connectAck} />}

          {(step === 'success' || step === 'error') && (
            <ResultStep
              outcome={outcome}
              host={form.host.trim()}
              onContinue={() => setStep('openrouter')}
              onTryAgain={handleTryAgain}
            />
          )}

          {step === 'openrouter' && (
            <OpenRouterStep savedHost={form.host.trim()} onDone={handleOpenRouterDone} />
          )}
        </Animated.View>
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

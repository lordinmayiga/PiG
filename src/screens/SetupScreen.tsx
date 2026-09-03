import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveBridgeCredentials } from '../secureStorage';
import { saveOpenRouterKey } from '../storage';
import { useTheme } from '../theme';
import { useCrossFade } from '../theme/motion';
import ConnectStep from './setup/ConnectStep';
import ConnectingStep from './setup/ConnectingStep';
import ResultStep from './setup/ResultStep';
import OpenRouterStep from './setup/OpenRouterStep';
import { emptyConnectForm, type ConnectFormState, type ConnectOutcome, type SetupStep } from './setup/types';
import { BridgeClient, WebSocketTransport, bridgeUrlFromHost } from '../network/bridgeClient';

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
  const [form, setForm] = useState<ConnectFormState>(emptyConnectForm);
  const [tokenPanelExpanded, setTokenPanelExpanded] = useState(false);
  const [forcedOutcome, setForcedOutcome] = useState<ConnectOutcome | null>(null);
  const [outcome, setOutcome] = useState<ConnectOutcome>('success');
  const [connectAck, setConnectAck] = useState(false);

  const activeClientRef = useRef<BridgeClient | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
      activeClientRef.current?.disconnect();
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

    const host = (activeForm.host ?? '').trim();
    const token = (activeForm.token ?? '').trim();

    if (!host || !token) {
      setOutcome('unreachable');
      setStep('error');
      return;
    }

    console.log('[PiG Setup] handleSubmit with host:', host, 'forcedOutcome:', forcedOutcome);
    setStep('connecting');
    setConnectAck(false);

    if (forcedOutcome) {
      setOutcome(forcedOutcome);
      if (forcedOutcome === 'success') {
        void saveBridgeCredentials({ host, token });
        setConnectAck(true);
        ackTimerRef.current = setTimeout(() => {
          setStep('success');
          setConnectAck(false);
        }, 420);
      } else {
        setStep('error');
      }
      return;
    }

    // Connect using real BridgeClient
    activeClientRef.current?.disconnect();
    let client: BridgeClient;
    try {
      const transport = new WebSocketTransport(bridgeUrlFromHost(host));
      client = new BridgeClient({ transport, token });
      activeClientRef.current = client;
    } catch {
      setOutcome('unreachable');
      setStep('error');
      return;
    }

    let settled = false;
    const finish = (resultOutcome: ConnectOutcome) => {
      if (settled) return;
      settled = true;
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      unsubStatus();
      unsubError();
      client.disconnect();
      activeClientRef.current = null;

      console.log('[PiG Setup] Connection outcome resolved:', resultOutcome);
      setOutcome(resultOutcome);
      if (resultOutcome === 'success') {
        console.log('[PiG Setup] Saving bridge credentials to storage:', { host, token });
        void saveBridgeCredentials({ host, token });
        setConnectAck(true);
        ackTimerRef.current = setTimeout(() => {
          setStep('success');
          setConnectAck(false);
        }, 420);
      } else {
        setStep('error');
      }
    };

    const unsubStatus = client.onConnectionStatus((status) => {
      if (status === 'connected') {
        finish('success');
      }
    });

    const unsubError = client.onError((err) => {
      if (err.code === 'bad_token') {
        finish('invalid-token');
      } else if (err.code === 'timeout') {
        finish('timeout');
      } else {
        finish('unreachable');
      }
    });

    timeoutTimerRef.current = setTimeout(() => {
      finish('timeout');
    }, 10000);

    client.connect();
  };

  const handleOpenRouterDone = async (apiKey: string | undefined) => {
    console.log('[PiG Setup] handleOpenRouterDone called. API key provided:', Boolean(apiKey));
    if (apiKey?.trim()) {
      await saveOpenRouterKey(apiKey.trim());
    }
    console.log('[PiG Setup] Calling onSetupComplete(). Transitioning to Tabs...');
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


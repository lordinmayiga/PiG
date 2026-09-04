import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { PrimaryButton, TextField } from './SetupUI';
import PairingTokenPanel from './PairingTokenPanel';
import DevOutcomeSwitcher from './DevOutcomeSwitcher';
import type { ConnectFormState, ConnectOutcome } from './types';
import { validateHost } from './validateHost';

interface ConnectStepProps {
  form: ConnectFormState;
  onFormChange: (form: ConnectFormState) => void;
  tokenPanelExpanded: boolean;
  onToggleTokenPanel: () => void;
  forcedOutcome: ConnectOutcome | null;
  onForcedOutcomeChange: (value: ConnectOutcome | null) => void;
  onSubmit: (overrideForm?: ConnectFormState) => void;
}

export default function ConnectStep({
  form,
  onFormChange,
  tokenPanelExpanded,
  onToggleTokenPanel,
  forcedOutcome,
  onForcedOutcomeChange,
  onSubmit,
}: ConnectStepProps) {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();
  const [hostError, setHostError] = useState<string | undefined>();

  const handleHostChange = (host: string) => {
    onFormChange({ ...form, host });
    if (hostError) {
      const res = validateHost(host);
      if (res.valid) {
        setHostError(undefined);
      }
    }
  };

  const handleHostBlur = () => {
    if (!form.host.trim()) {
      setHostError(undefined);
      return;
    }
    const res = validateHost(form.host);
    if (!res.valid) {
      setHostError(res.error);
    } else {
      setHostError(undefined);
    }
  };

  const handleConnect = () => {
    console.log('[PiG Button] "Connect" clicked. Host:', form.host, 'Token:', form.token);
    const res = validateHost(form.host);
    if (!res.valid) {
      setHostError(res.error);
      return;
    }
    setHostError(undefined);
    onSubmit({ ...form, host: res.cleanHost ?? form.host.trim() });
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.title, { color: colors.ink }]}>
          Connect to your VPS
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.body, { color: colors.inkSecondary }]}>
          Enter the host and pairing token printed by pig-bridge pair on your VPS.
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <TextField
          label="Host"
          value={form.host}
          onChangeText={handleHostChange}
          onBlur={handleHostBlur}
          errorText={hostError}
          placeholder="e.g. 203.0.113.10:8443"
          autoCapitalize="none"
        />
        <TextField
          label="Pairing token"
          value={form.token}
          onChangeText={(token) => onFormChange({ ...form, token })}
          placeholder="Paste the token from pig-bridge pair"
          autoCapitalize="none"
        />
        <PrimaryButton
          label="Connect"
          onPress={handleConnect}
          disabled={!form.host.trim() || !form.token.trim()}
        />
      </View>

      <PairingTokenPanel expanded={tokenPanelExpanded} onToggle={onToggleTokenPanel} />

      <DevOutcomeSwitcher forced={forcedOutcome} onChange={onForcedOutcomeChange} />
    </View>
  );
}


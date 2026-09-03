import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { LinkButton, PrimaryButton, TextField } from './SetupUI';
import ScanFrame from './ScanFrame';
import PairingTokenPanel from './PairingTokenPanel';
import DevOutcomeSwitcher from './DevOutcomeSwitcher';
import type { ConnectFormState, ConnectMode, ConnectOutcome } from './types';

interface ConnectStepProps {
  mode: ConnectMode;
  onModeChange: (mode: ConnectMode) => void;
  form: ConnectFormState;
  onFormChange: (form: ConnectFormState) => void;
  tokenPanelExpanded: boolean;
  onToggleTokenPanel: () => void;
  forcedOutcome: ConnectOutcome | null;
  onForcedOutcomeChange: (value: ConnectOutcome | null) => void;
  onSubmit: (overrideForm?: ConnectFormState) => void;
}

/** Demo host/token filled in when "Simulate scan" stands in for a real camera capture. */
export const MOCK_SCANNED_HOST = '198.51.100.23:8443';
export const MOCK_SCANNED_TOKEN = 'a1b2c3d4e5f6';

export default function ConnectStep({
  mode,
  onModeChange,
  form,
  onFormChange,
  tokenPanelExpanded,
  onToggleTokenPanel,
  forcedOutcome,
  onForcedOutcomeChange,
  onSubmit,
}: ConnectStepProps) {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();
  const [scanSimulated, setScanSimulated] = useState(false);

  const handleSimulateScan = () => {
    const simulated: ConnectFormState = { host: MOCK_SCANNED_HOST, token: MOCK_SCANNED_TOKEN };
    onFormChange(simulated);
    setScanSimulated(true);
    onSubmit(simulated);
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.title, { color: colors.ink }]}>
          Connect to your VPS
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.body, { color: colors.inkSecondary }]}>
          {mode === 'scan'
            ? 'Scan the pairing QR code printed by pig-bridge pair on your VPS.'
            : 'Enter the host and pairing token printed by pig-bridge pair on your VPS.'}
        </Text>
      </View>

      {mode === 'scan' ? (
        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          <ScanFrame />
          <PrimaryButton
            label={scanSimulated ? 'Scanned' : 'Simulate scan'}
            onPress={handleSimulateScan}
            disabled={scanSimulated}
          />
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[typeScale.caption, { color: colors.inkPlaceholder, textAlign: 'center' }]}
          >
            No camera wired up in this build — Simulate scan stands in for a real code capture.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <TextField
            label="Host"
            value={form.host}
            onChangeText={(host) => onFormChange({ ...form, host })}
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
          <PrimaryButton label="Connect" onPress={() => onSubmit()} disabled={!form.host.trim() || !form.token.trim()} />
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <LinkButton
          label={mode === 'scan' ? 'Enter host & token manually instead' : 'Scan a QR code instead'}
          onPress={() => onModeChange(mode === 'scan' ? 'manual' : 'scan')}
        />
      </View>

      <PairingTokenPanel expanded={tokenPanelExpanded} onToggle={onToggleTokenPanel} />

      <DevOutcomeSwitcher forced={forcedOutcome} onChange={onForcedOutcomeChange} />
    </View>
  );
}

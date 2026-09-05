import { Text, View } from 'react-native';
import { CircleCheck, ClockAlert, KeyRound, WifiOff } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { Icon, iconSizes } from '../../theme/icons';
import { PrimaryButton } from './SetupUI';
import type { ConnectOutcome } from './types';

interface ResultStepProps {
  outcome: ConnectOutcome;
  host: string;
  onContinue: () => void;
  onTryAgain: () => void;
}

const ERROR_COPY: Record<Exclude<ConnectOutcome, 'success'>, { title: string; body: (host: string) => string; icon: typeof WifiOff }> = {
  unreachable: {
    title: "Can't reach that host",
    body: (host) => `Couldn't reach ${host || 'that host'}. Check the address and that your VPS is running, then try again.`,
    icon: WifiOff,
  },
  'invalid-token': {
    title: "Token didn't work",
    body: () => 'That pairing token is invalid or has expired. Run pig-bridge pair again for a new one, then try again.',
    icon: KeyRound,
  },
  timeout: {
    title: 'Connection timed out',
    body: () => "The VPS didn't respond in time. Check your network and try again.",
    icon: ClockAlert,
  },
};

export default function ResultStep({ outcome, host, onContinue, onTryAgain }: ResultStepProps) {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();

  if (outcome === 'success') {
    return (
      <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
        <Icon icon={CircleCheck} size={iconSizes.lg} color={colors.success} />
        <View style={{ gap: spacing.xxs, alignItems: 'center' }}>
          <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.heading, { color: colors.ink }]}>
            Connected
          </Text>
          <Text
            maxFontSizeMultiplier={maxFontScale}
            style={[typeScale.body, { color: colors.inkSecondary, textAlign: 'center' }]}
          >
            Paired with {host}.
          </Text>
        </View>
        <PrimaryButton
          label="Continue"
          onPress={() => {
            console.log('[PiG Button] "Continue" clicked on ResultStep. Host:', host);
            onContinue();
          }}
        />
      </View>
    );
  }

  const copy = ERROR_COPY[outcome];

  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
      <Icon icon={copy.icon} size={iconSizes.lg} color={colors.destructive} />
      <View style={{ gap: spacing.xxs, alignItems: 'center' }}>
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.heading, { color: colors.ink }]}>
          {copy.title}
        </Text>
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[typeScale.body, { color: colors.inkSecondary, textAlign: 'center' }]}
        >
          {copy.body(host)}
        </Text>
      </View>
      <PrimaryButton
        label="Try again"
        onPress={() => {
          console.log('[PiG Button] "Try again" clicked on ResultStep after outcome:', outcome);
          onTryAgain();
        }}
      />
    </View>
  );
}

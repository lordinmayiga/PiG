import { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { Icon, iconSizes } from '../../theme/icons';
import { LinkButton, PrimaryButton, TextField } from './SetupUI';

interface OpenRouterStepProps {
  /** Called with the entered key (or undefined for "Skip for now") — either way, the flow finishes. */
  onDone: (apiKey: string | undefined) => void;
}

/** Optional OpenRouter key entry, right after a successful pairing (SPEC.md §3.7). Never blocks. */
export default function OpenRouterStep({ onDone }: OpenRouterStepProps) {
  const { colors, spacing, typeScale, maxFontScale } = useTheme();
  const [apiKey, setApiKey] = useState('');

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Icon icon={KeyRound} size={iconSizes.lg} color={colors.accent} />
        <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.title, { color: colors.ink, textAlign: 'center' }]}>
          Add an OpenRouter key
        </Text>
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[typeScale.body, { color: colors.inkSecondary, textAlign: 'center' }]}
        >
          Optional. Lets your VPS route certain composer input through OpenRouter. Add or change this anytime in
          Settings.
        </Text>
      </View>

      <TextField
        label="API key"
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="sk-or-…"
        autoCapitalize="none"
        secureTextEntry
      />

      <View style={{ gap: spacing.sm, alignItems: 'center' }}>
        <PrimaryButton label="Save & continue" onPress={() => onDone(apiKey || undefined)} disabled={!apiKey.trim()} />
        <LinkButton label="Skip for now" onPress={() => onDone(undefined)} />
      </View>
    </View>
  );
}

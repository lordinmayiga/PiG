import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { Icon, iconSizes } from '../../theme/icons';
import { getLastStorageError, loadBridgeCredentials, type BridgeCredentials } from '../../secureStorage';
import { LinkButton, PrimaryButton, TextField } from './SetupUI';

interface OpenRouterStepProps {
  /** Called with the entered key (or undefined for "Skip for now") — either way, the flow finishes. */
  onDone: (apiKey: string | undefined) => Promise<void> | void;
  savedHost?: string;
}

/** Optional OpenRouter key entry, right after a successful pairing (SPEC.md §3.7). Never blocks. */
export default function OpenRouterStep({ onDone, savedHost }: OpenRouterStepProps) {
  const { colors, spacing, radius, typeScale, maxFontScale } = useTheme();
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<BridgeCredentials | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    loadBridgeCredentials().then((creds) => {
      setCredentials(creds);
      setStorageError(getLastStorageError());
    });
  }, []);

  const handleFinish = async (key: string | undefined) => {
    setIsSubmitting(true);
    try {
      await onDone(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(
        "Couldn't finish setup",
        msg || 'An error occurred while saving your settings. Try again.',
        [{ text: 'Retry', style: 'default' }],
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <PrimaryButton
          label="Save & continue"
          loading={isSubmitting}
          onPress={() => handleFinish(apiKey || undefined)}
          disabled={!apiKey.trim() || isSubmitting}
        />
        <LinkButton
          label={isSubmitting ? 'Saving…' : 'Skip for now'}
          onPress={() => !isSubmitting && handleFinish(undefined)}
        />
      </View>

      {__DEV__ && (
        <View
          style={[
            styles.devBox,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius.card,
              padding: spacing.md,
              gap: spacing.xs,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon
              icon={credentials ? CheckCircle2 : AlertCircle}
              size={iconSizes.sm}
              color={credentials ? colors.success : colors.warning}
            />
            <Text
              maxFontSizeMultiplier={maxFontScale}
              style={[typeScale.caption, { color: colors.ink, fontWeight: '600' }]}
            >
              Dev mode status: {credentials ? 'Paired credentials saved' : 'No credentials detected in storage'}
            </Text>
          </View>

          <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.caption, { color: colors.inkSecondary }]}>
            Host: {credentials?.host ?? savedHost ?? 'None'} · Token:{' '}
            {credentials?.token ? `…${credentials.token.slice(-4)}` : 'None'}
          </Text>

          {storageError ? (
            <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.caption, { color: colors.destructive }]}>
              Storage: {storageError}
            </Text>
          ) : null}

          <View style={{ marginTop: spacing.xxs }}>
            <PrimaryButton
              label="Force complete setup (Dev bypass)"
              variant="outline"
              onPress={() => handleFinish(apiKey || undefined)}
              loading={isSubmitting}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  devBox: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
});


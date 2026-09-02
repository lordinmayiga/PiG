import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';

import { useTheme } from '../../theme';
import { Icon, iconSizes } from '../../theme/icons';
import { CollapsiblePanel } from './SetupUI';
import { PAIRING_SETUP_COMMAND } from './types';

/** Collapsible "Don't have a pairing token yet?" panel, shared by the scan and manual surfaces. */
export default function PairingTokenPanel({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { colors, spacing, radius, typeScale, maxFontScale, minTouchTarget } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(PAIRING_SETUP_COMMAND);
    setCopied(true);
  };

  return (
    <CollapsiblePanel title="Don't have a pairing token yet?" expanded={expanded} onToggle={onToggle}>
      <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.body, { color: colors.inkSecondary }]}>
        Run this on your VPS to generate one. Tokens are valid for 10 minutes.
      </Text>
      <View
        style={[
          styles.commandRow,
          { borderRadius: radius.chip, backgroundColor: colors.canvas, borderColor: colors.border, paddingLeft: spacing.sm },
        ]}
      >
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[typeScale.body, { color: colors.ink, fontFamily: 'monospace', flex: 1 }]}
        >
          {PAIRING_SETUP_COMMAND}
        </Text>
        <Pressable
          onPress={handleCopy}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy command'}
          hitSlop={8}
          style={{ minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon icon={copied ? Check : Copy} size={iconSizes.md} color={copied ? colors.success : colors.inkSecondary} />
        </Pressable>
      </View>
    </CollapsiblePanel>
  );
}

const styles = StyleSheet.create({
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});

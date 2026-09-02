import { StyleSheet, Text, View } from 'react-native';

// Placeholder — Settings (VPS connection row, OpenRouter key row,
// lock/security) gets built out in Phase 4 against mock data.
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text>SettingsScreen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { StyleSheet, Text, View } from 'react-native';

// Placeholder — first-run Setup flow (QR/manual connect, error states, success,
// optional OpenRouter key) gets built out in Phase 4 against mock state.
export default function SetupScreen() {
  return (
    <View style={styles.container}>
      <Text>SetupScreen</Text>
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

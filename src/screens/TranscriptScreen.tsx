import { StyleSheet, Text, View } from 'react-native';

// Placeholder — Session Transcript (full-width markdown turns + Composer)
// gets built out in Phase 4 against mock/fixture data.
export default function TranscriptScreen() {
  return (
    <View style={styles.container}>
      <Text>TranscriptScreen</Text>
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

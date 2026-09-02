import { StyleSheet, Text, View } from 'react-native';

// Placeholder — Embedded Browser (WebView tab strip) gets built out in
// Phase 4 against mock data.
export default function BrowserScreen() {
  return (
    <View style={styles.container}>
      <Text>BrowserScreen</Text>
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

import { StyleSheet, Text, View } from 'react-native';

// Placeholder — File Explorer (breadcrumb navigation of a session's working
// folder) gets built out in Phase 4 against mock data.
export default function FileExplorerScreen() {
  return (
    <View style={styles.container}>
      <Text>FileExplorerScreen</Text>
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

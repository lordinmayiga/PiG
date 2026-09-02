import { StyleSheet, Text, View } from 'react-native';

// Placeholder — Sessions list (single-column card list + empty state + New
// Session sheet) gets built out in Phase 4 against mock data.
export default function SessionsScreen() {
  return (
    <View style={styles.container}>
      <Text>SessionsScreen</Text>
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

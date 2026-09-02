import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SetupScreen from '../screens/SetupScreen';
import TabNavigator from './TabNavigator';

// Top-level stack: gates the entire tab shell behind first-run Setup until a
// VPS is paired (per SPEC.md §3.7 / pig-architecture-decisions).
export type RootStackParamList = {
  Setup: undefined;
  Tabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  // PLACEHOLDER: local state standing in for real persisted pairing state.
  // Replace with the actual pairing-state check (e.g. from expo-secure-store /
  // a context provider) in Phase 5 — see SETUP_PLAN.md Phase 5.
  const [isPaired] = useState(false);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isPaired ? (
        <Stack.Screen name="Tabs" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Setup" component={SetupScreen} />
      )}
    </Stack.Navigator>
  );
}

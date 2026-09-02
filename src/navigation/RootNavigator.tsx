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
  // SetupScreen flips this via onSetupComplete once its local mock flow
  // finishes, so the app actually navigates through to the Tab shell for a
  // real demo — but it's still just component state, not persisted.
  // Replace with the actual pairing-state check (e.g. from expo-secure-store /
  // a context provider) in Phase 5 — see SETUP_PLAN.md Phase 5.
  const [isPaired, setIsPaired] = useState(false);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isPaired ? (
        <Stack.Screen name="Tabs" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Setup">
          {() => <SetupScreen onSetupComplete={() => setIsPaired(true)} />}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}

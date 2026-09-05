import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SetupScreen from '../screens/SetupScreen';
import { loadBridgeCredentials, subscribeToCredentialsChange } from '../secureStorage';
import { useColors } from '../theme';
import { BridgeProvider } from '../contexts/BridgeContext';
import { SessionsProvider } from '../contexts/SessionsContext';
import TabNavigator from './TabNavigator';

// Top-level stack: gates the entire tab shell behind first-run Setup until a
// VPS is paired (per SPEC.md §3.7 / pig-architecture-decisions).
export type RootStackParamList = {
  Setup: undefined;
  Tabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const colors = useColors();
  // null = still reading credentials (see below); resolves to a real
  // boolean before first paint of Setup/Tabs so we never flash one then jump
  // to the other. "Paired" is derived from "do secure credentials exist" —
  // see src/secureStorage.ts.
  const [isPaired, setIsPaired] = useState<boolean | null>(null);

  const refreshPairedState = () => {
    loadBridgeCredentials().then((credentials) => setIsPaired(credentials !== null));
  };

  useEffect(() => {
    refreshPairedState();
    // React when credentials change (paired or disconnected)
    return subscribeToCredentialsChange((credentials) => {
      console.log('[PiG Nav] Credentials changed:', credentials ? `paired with ${credentials.host}` : 'unpaired (null)');
      setIsPaired(credentials !== null);
    });
  }, []);

  const handleSetupComplete = async () => {
    const creds = await loadBridgeCredentials();
    setIsPaired(creds !== null);
  };

  if (isPaired === null) {
    // Credentials haven't finished loading yet — avoid flashing Setup then
    // jumping to Tabs (or vice versa). Same style as App.tsx's font-loading
    // placeholder.
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isPaired ? (
        <Stack.Screen name="Tabs">
          {() => (
            <BridgeProvider>
              <SessionsProvider>
                <TabNavigator />
              </SessionsProvider>
            </BridgeProvider>
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Setup">
          {() => <SetupScreen onSetupComplete={handleSetupComplete} />}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}

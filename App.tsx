import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
} from '@expo-google-fonts/onest';

import RootNavigator from './src/navigation/RootNavigator';
import { ThemeModeProvider } from './src/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });

  if (!fontsLoaded) {
    // Minimal loading placeholder — avoids a flash of the system font
    // before Onest is available. Real loading UI is a later phase.
    return <View style={{ flex: 1, backgroundColor: '#fbf5f3' }} />;
  }

  return (
    <ThemeModeProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </SafeAreaProvider>
    </ThemeModeProvider>
  );
}

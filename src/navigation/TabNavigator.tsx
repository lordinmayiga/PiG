import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Globe, MessageSquare, Settings } from 'lucide-react-native';

import BrowserScreen from '../screens/BrowserScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme';
import SessionsStackNavigator from './SessionsStackNavigator';

// Bottom tab order: Browser | Sessions | Settings — Sessions in the middle as
// the primary destination. Settled 2026-09-02 (see pig-architecture-decisions
// memory and the pig-navigation-structure skill); this supersedes any older
// "Sessions | Browser | Settings" order shown in DESIGN.md.
export type TabParamList = {
  Browser: undefined;
  Sessions: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Sessions"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Browser"
        component={BrowserScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsStackNavigator}
        options={({ route }) => {
          // Sessions nests its own stack (Sessions list -> Transcript ->
          // FileExplorer). The tab bar belongs only on the list itself —
          // once a session is open, the composer is the bottom-most thing
          // on screen, no tab bar underneath it. Hide via display:'none'
          // (the standard RN pattern) whenever the focused nested route
          // isn't the list.
          const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? 'Sessions';
          const hideTabBar = focusedRouteName !== 'Sessions';
          return {
            tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
            ...(hideTabBar ? { tabBarStyle: { display: 'none' } } : {}),
          };
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

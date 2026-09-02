import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Globe, MessageSquare, Settings } from 'lucide-react-native';

import BrowserScreen from '../screens/BrowserScreen';
import SettingsScreen from '../screens/SettingsScreen';
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
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
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
        options={{
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
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

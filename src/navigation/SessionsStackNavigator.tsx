import { createNativeStackNavigator } from '@react-navigation/native-stack';

import FileExplorerScreen from '../screens/FileExplorerScreen';
import SessionsScreen from '../screens/SessionsScreen';
import TranscriptScreen from '../screens/TranscriptScreen';

// Nested stack under the Sessions tab: Sessions (list) -> Transcript -> File
// Explorer, per SPEC.md §3 (Transcript and File Explorer are pushed on top of
// a session, not separate tabs).
export type SessionsStackParamList = {
  Sessions: undefined;
  // sessionId identifies which session's transcript to load — added when
  // SessionsScreen wired up tap-to-open navigation (Phase 4).
  Transcript: { sessionId: string };
  // initialPath seeds the explorer's starting folder (e.g. the opening
  // session's working directory) — optional so other call sites (a
  // non-session-scoped entry point, if one is added) still fall through to
  // FileExplorerScreen's own default.
  FileExplorer: { initialPath?: string } | undefined;
};

const Stack = createNativeStackNavigator<SessionsStackParamList>();

export default function SessionsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Sessions" component={SessionsScreen} />
      <Stack.Screen name="Transcript" component={TranscriptScreen} />
      <Stack.Screen name="FileExplorer" component={FileExplorerScreen} />
    </Stack.Navigator>
  );
}

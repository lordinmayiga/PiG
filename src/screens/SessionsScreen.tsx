import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { mockSessions, emptySessions } from '../fixtures/sessions';
import { useSessions } from '../contexts/SessionsContext';
import type { Session } from '../types';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import SessionCard from './sessions/SessionCard';
import NewSessionSheet, { type NewSessionDraft } from './sessions/NewSessionSheet';
import RenameSessionSheet from './sessions/RenameSessionSheet';
import SessionActionMenu from './sessions/SessionActionMenu';

// DEV VIEW DEFAULT: starts from `mockSessions` (the populated list) since
// that's the more useful default for building/reviewing the card list and
// its interactions. The genuine empty state (SPEC.md §3.7's handoff from
// Setup) is reachable via the "Preview empty state" dev toggle below, or
// naturally once every mock session has been killed.
const DEV_START_FROM_EMPTY = false;

let nextSessionSeq = 1;

export default function SessionsScreen() {
  const { colors, spacing, radius, typeScale, minTouchTarget, screenMargin } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SessionsStackParamList, 'Sessions'>>();

  const { sessions, removeSessionLocally, addSessionLocally, renameSessionLocally, setSessionsLocally } =
    useSessions();
  // DEV_START_FROM_EMPTY only matters on first mount, since SessionsContext
  // already seeds from mockSessions itself — apply it once here rather than
  // duplicating the seed value in two places. A brief mockSessions flash
  // before this effect runs is an acceptable trade for not touching
  // another component's state during render.
  useEffect(() => {
    if (DEV_START_FROM_EMPTY) setSessionsLocally(emptySessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once-only, see comment above
  }, []);
  const [isNewSessionVisible, setNewSessionVisible] = useState(false);
  const [menuSession, setMenuSession] = useState<Session | null>(null);
  const [renameSession, setRenameSession] = useState<Session | null>(null);

  const openTranscript = (session: Session) => {
    navigation.navigate('Transcript', { sessionId: session.id });
  };

  const requestKill = (session: Session) => {
    Alert.alert('Kill this session?', 'This stops the agent and closes the session. Anything not saved elsewhere will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kill session',
        style: 'destructive',
        onPress: () => removeSessionLocally(session.id),
      },
    ]);
  };

  const handleMenuKill = (session: Session) => {
    setMenuSession(null);
    requestKill(session);
  };

  const handleMenuRename = (session: Session) => {
    setMenuSession(null);
    setRenameSession(session);
  };

  const handleRenameSave = (session: Session, newName: string) => {
    renameSessionLocally(session.id, newName);
    setRenameSession(null);
  };

  const handleCreateSession = (draft: NewSessionDraft) => {
    const now = new Date().toISOString();
    const newSession: Session = {
      id: `sess-new-${nextSessionSeq++}`,
      name: draft.name,
      agent: draft.agent,
      folder: draft.folder,
      status: 'active',
      createdAt: now,
      lastActivityAt: now,
      lastMessagePreview: 'Session started — no messages yet.',
    };
    addSessionLocally(newSession);
    setNewSessionVisible(false);
    openTranscript(newSession);
  };

  const isEmpty = sessions.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: screenMargin, marginTop: spacing.md }]}>
        <Text style={[typeScale.title, { color: colors.ink }]}>Sessions</Text>
        {__DEV__ && (
          <Pressable
            onPress={() => setSessionsLocally(sessions.length === 0 ? mockSessions : emptySessions)}
            accessibilityRole="button"
            accessibilityLabel="Toggle empty state preview"
          >
            <Text style={[typeScale.caption, { color: colors.inkPlaceholder }]}>
              {isEmpty ? 'Preview populated' : 'Preview empty state'}
            </Text>
          </Pressable>
        )}
      </View>

      {isEmpty ? (
        <View style={[styles.emptyState, { paddingHorizontal: screenMargin }]}>
          <Text style={[typeScale.heading, { color: colors.ink, textAlign: 'center' }]} maxFontSizeMultiplier={1.3}>
            No sessions yet
          </Text>
          <Text
            style={[typeScale.body, { color: colors.inkSecondary, textAlign: 'center', marginTop: spacing.xs }]}
            maxFontSizeMultiplier={1.3}
          >
            Start one to begin working with an agent on your VPS.
          </Text>
          <Pressable
            onPress={() => setNewSessionVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="New session"
            style={[
              styles.emptyButton,
              {
                backgroundColor: colors.accent,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.lg,
                minHeight: minTouchTarget,
                marginTop: spacing.lg,
              },
            ]}
          >
            <Text style={[typeScale.bodyMedium, { color: colors.onAccent }]} maxFontSizeMultiplier={1.3}>
              New session
            </Text>
          </Pressable>
          <Text
            style={[
              typeScale.caption,
              { color: colors.inkPlaceholder, textAlign: 'center', marginTop: spacing.md, maxWidth: 280 },
            ]}
            maxFontSizeMultiplier={1.3}
          >
            Sessions persist in tmux even if the app closes or disconnects.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SessionCard
              session={item}
              index={index}
              onPress={openTranscript}
              onOpenMenu={setMenuSession}
              onSwipeKill={requestKill}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: screenMargin,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl + insets.bottom,
            gap: spacing.sm,
          }}
        />
      )}

      {!isEmpty && (
        <Pressable
          onPress={() => setNewSessionVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="New session"
          style={[
            styles.fab,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.pill,
              right: screenMargin,
              bottom: spacing.lg + insets.bottom,
            },
          ]}
        >
          <Icon icon={Plus} size={24} color={colors.onAccent} />
        </Pressable>
      )}

      <NewSessionSheet
        visible={isNewSessionVisible}
        onClose={() => setNewSessionVisible(false)}
        onCreate={handleCreateSession}
      />
      <SessionActionMenu
        session={menuSession}
        onClose={() => setMenuSession(null)}
        onRename={handleMenuRename}
        onKill={handleMenuKill}
      />
      <RenameSessionSheet session={renameSession} onClose={() => setRenameSession(null)} onSave={handleRenameSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});

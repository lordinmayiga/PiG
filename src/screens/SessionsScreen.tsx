import { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedAnimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useScaleIn, usePressScale } from '../theme/motion';
import { useSessions } from '../contexts/SessionsContext';
import type { Session } from '../types';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import SessionCard from './sessions/SessionCard';
import NewSessionSheet, { type NewSessionDraft } from './sessions/NewSessionSheet';
import RenameSessionSheet from './sessions/RenameSessionSheet';
import SessionActionMenu from './sessions/SessionActionMenu';

const DEV_DUMMY_SESSIONS: Session[] = [
  {
    id: 'dev-sample-1',
    name: 'api-refactor',
    agent: 'claude-code',
    folder: '/root/projects/api',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    lastMessagePreview: 'Refactored auth endpoints.',
  },
];

export default function SessionsScreen() {
  const { colors, spacing, radius, typeScale, minTouchTarget, screenMargin } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SessionsStackParamList, 'Sessions'>>();

  const {
    sessions,
    createSession,
    killSession,
    renameSession: renameSessionBridge,
    removeSessionLocally,
    renameSessionLocally,
    setSessionsLocally,
  } = useSessions();

  const [isNewSessionVisible, setNewSessionVisible] = useState(false);
  const [menuSession, setMenuSession] = useState<Session | null>(null);
  const [renameSession, setRenameSession] = useState<Session | null>(null);
  // Session whose kill has been confirmed but whose row-collapse animation
  // (SessionCard's useCollapseOnRemove) hasn't settled yet — the session
  // is only actually removed from `sessions` once that animation completes.
  const [killingSessionId, setKillingSessionId] = useState<string | null>(null);

  const fabScaleStyle = useScaleIn();
  const { style: fabPressStyle, pressProps: fabPressProps } = usePressScale();

  const openTranscript = (session: Session) => {
    navigation.navigate('Transcript', { sessionId: session.id });
  };

  const requestKill = (session: Session) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Kill this session? This stops the agent and closes the session. Anything not saved elsewhere will be lost.')) {
        setKillingSessionId(session.id);
      }
      return;
    }
    Alert.alert('Kill this session?', 'This stops the agent and closes the session. Anything not saved elsewhere will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kill session',
        style: 'destructive',
        onPress: () => setKillingSessionId(session.id),
      },
    ]);
  };

  const handleKillAnimationComplete = (sessionId: string) => {
    removeSessionLocally(sessionId);
    void killSession(sessionId);
    setKillingSessionId((current) => (current === sessionId ? null : current));
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
    void renameSessionBridge(session.id, newName);
    setRenameSession(null);
  };

  const handleCreateSession = (draft: NewSessionDraft) => {
    setNewSessionVisible(false);
    void createSession(draft.name, draft.folder);
    navigation.navigate('Transcript', { sessionId: draft.name });
  };

  const isEmpty = sessions.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: screenMargin, marginTop: spacing.md }]}>
        <Text style={[typeScale.title, { color: colors.ink }]}>Sessions</Text>
        {__DEV__ && (
          <Pressable
            onPress={() => setSessionsLocally(sessions.length === 0 ? DEV_DUMMY_SESSIONS : [])}
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
              isKilling={item.id === killingSessionId}
              onKillAnimationComplete={handleKillAnimationComplete}
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
        <ReanimatedAnimated.View
          style={[
            styles.fabWrapper,
            { right: screenMargin, bottom: spacing.lg + insets.bottom },
            fabScaleStyle,
          ]}
        >
          <Pressable
            onPress={() => setNewSessionVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="New session"
            style={styles.fabPressable}
            {...fabPressProps}
          >
            <ReanimatedAnimated.View
              style={[styles.fab, { backgroundColor: colors.accent, borderRadius: radius.pill }, fabPressStyle]}
            >
              <Icon icon={Plus} size={24} color={colors.onAccent} />
            </ReanimatedAnimated.View>
          </Pressable>
        </ReanimatedAnimated.View>
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
  fabWrapper: {
    position: 'absolute',
    width: 56,
    height: 56,
  },
  fabPressable: {
    width: '100%',
    height: '100%',
  },
  fab: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});

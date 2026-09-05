import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { AlertCircle, ChevronLeft, File, FileText, Folder, FolderOpen, Image as ImageIcon } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useFolderTraverseSlide } from '../theme/motion';
import { useBridge } from '../contexts/BridgeContext';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { FileNode } from '../types';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';

type Nav = NativeStackNavigationProp<SessionsStackParamList, 'FileExplorer'>;
type ExplorerRoute = RouteProp<SessionsStackParamList, 'FileExplorer'>;

function parentPath(path: string): string {
  const segments = path.split('/');
  segments.pop();
  return segments.join('/');
}

/** Segment depth of a path — used to tell descending from ascending navigation. */
function pathDepth(path: string): number {
  return path ? path.split('/').length : 0;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindForMimeType(mimeType?: string): ViewableFile['kind'] {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'other';
}

function iconFor(node: FileNode) {
  if (node.type === 'folder') return Folder;
  const kind = kindForMimeType(node.mimeType);
  if (kind === 'image') return ImageIcon;
  if (kind === 'text') return FileText;
  return File;
}

/**
 * File Explorer per SPEC.md §3.6: breadcrumb path bar over the session's
 * working folder, folders before files, tap a folder to descend, tap a
 * file to open the same FileViewerSheet transcript file chips use.
 */
export default function FileExplorerScreen() {
  const { colors, spacing, typeScale, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ExplorerRoute>();
  const { client } = useBridge();
  // Opened from within a session (TranscriptScreen's folder button), this
  // seeds the explorer at that session's working directory instead of the
  // backend's global default. Any other call site that omits the param
  // (none exist today) still falls through to '' -> fsList(undefined)'s
  // existing default-root behavior.
  const [currentPath, setCurrentPath] = useState(route.params?.initialPath ?? '');
  const [navDirection, setNavDirection] = useState<'forward' | 'back'>('forward');
  const [fsEntries, setFsEntries] = useState<FileNode[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const traverseStyle = useFolderTraverseSlide(currentPath, navDirection);

  const breadcrumbScrollRef = useRef<ScrollView>(null);
  const breadcrumbLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const breadcrumbViewportWidth = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!client) {
      return;
    }
    // Reset any stale error from a previous path/retry before the new fetch
    // resolves — an intentional "clear then refetch" effect, not a derived
    // value the render could compute instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListError(null);
    client
      .fsList(currentPath || undefined)
      .then((list) => {
        if (cancelled) return;
        const nodes: FileNode[] = list.map((e) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          sizeBytes: e.sizeBytes,
          mimeType: e.mimeType,
        }));
        setFsEntries(nodes);
      })
      .catch((err) => {
        // Keep whatever entries were already showing — fsList is all-or-
        // nothing in this codebase, so there's nothing partial to merge, but
        // a failed listing must not be conflated with a genuinely empty
        // folder (pig-screen-states' partial/error rule).
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, currentPath, retryToken]);

  /** Navigate to `path`, inferring forward/back from the depth change for the slide direction. */
  const navigateTo = useCallback(
    (path: string) => {
      setNavDirection(pathDepth(path) >= pathDepth(currentPath) ? 'forward' : 'back');
      setCurrentPath(path);
    },
    [currentPath],
  );

  const entries = useMemo(() => {
    return [...fsEntries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [fsEntries]);

  const breadcrumbs = useMemo(() => {
    // The backend returns absolute paths (e.g. "/root/projects/PiG"), so a
    // naive `.split('/')` produces an empty leading segment before the
    // first "/" — that became a second crumb with path: '', colliding with
    // the "Working folder" root crumb's key and triggering React's
    // duplicate-key warning. `.filter(Boolean)` drops that empty segment;
    // `isAbsolute` re-adds the leading "/" while rebuilding each crumb's
    // path so navigating a crumb still resolves to a real absolute path
    // instead of one resolveSafePath would misinterpret as relative.
    const isAbsolute = currentPath.startsWith('/');
    const segments = currentPath ? currentPath.split('/').filter(Boolean) : [];
    const crumbs: { label: string; path: string }[] = [{ label: 'Working folder', path: '' }];
    let built = '';
    for (const segment of segments) {
      built = isAbsolute ? `${built}/${segment}` : built ? `${built}/${segment}` : segment;
      crumbs.push({ label: segment, path: built });
    }
    return crumbs;
  }, [currentPath]);

  const handlePress = useCallback(
    async (node: FileNode) => {
      if (node.type === 'folder') {
        navigateTo(node.path);
        return;
      }
      const kind = kindForMimeType(node.mimeType);
      setViewerFile({
        name: node.name,
        path: node.path,
        kind,
        mimeType: node.mimeType,
        sizeBytes: node.sizeBytes,
      });
      if (kind === 'text') {
        if (client) {
          try {
            const content = await client.fsRead(node.path);
            setViewerContent(content);
          } catch {
            setViewerContent(undefined);
          }
        } else {
          setViewerContent(undefined);
        }
      } else {
        setViewerContent(undefined);
      }
    },
    [client, navigateTo],
  );

  const closeViewer = useCallback(() => {
    setViewerFile(null);
    setViewerContent(undefined);
  }, []);

  // Bring the active (last) breadcrumb segment into view whenever the path changes.
  useEffect(() => {
    const active = breadcrumbs[breadcrumbs.length - 1];
    const layout = breadcrumbLayouts.current[active.path];
    if (!layout || !breadcrumbScrollRef.current) return;
    const targetX = Math.max(0, layout.x + layout.width / 2 - breadcrumbViewportWidth.current / 2);
    breadcrumbScrollRef.current.scrollTo({ x: targetX, animated: true });
  }, [breadcrumbs]);

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { minWidth: minTouchTarget, minHeight: minTouchTarget }]}
        >
          <Icon icon={ChevronLeft} size={24} color={colors.ink} />
        </Pressable>
        <Text style={[typeScale.heading, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
          File Explorer
        </Text>
      </View>

      <ScrollView
        ref={breadcrumbScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.breadcrumbBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: spacing.md, alignItems: 'center' }}
        onLayout={(e: LayoutChangeEvent) => {
          breadcrumbViewportWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {breadcrumbs.map((crumb, index) => (
          <View
            key={crumb.path}
            style={styles.crumbRow}
            onLayout={(e: LayoutChangeEvent) => {
              breadcrumbLayouts.current[crumb.path] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
            }}
          >
            {index > 0 ? (
              <Text style={[typeScale.body, { color: colors.inkSecondary, marginHorizontal: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
                /
              </Text>
            ) : null}
            <Pressable
              onPress={() => navigateTo(crumb.path)}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${crumb.label}`}
              hitSlop={6}
            >
              <Text
                style={[
                  typeScale.bodyMedium,
                  { color: index === breadcrumbs.length - 1 ? colors.ink : colors.accent },
                ]}
                maxFontSizeMultiplier={1.3}
              >
                {crumb.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Animated.View style={[styles.listWrapper, traverseStyle]}>
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xs + insets.bottom }}
          ListEmptyComponent={
            listError ? (
              // Total-failure state per pig-screen-states: this must never
              // look like a genuinely empty folder — destructive icon/copy +
              // Retry, distinct from the "This folder is empty" treatment.
              <View style={[styles.emptyState, { padding: spacing.xl, alignItems: 'center' }]}>
                <Icon icon={AlertCircle} size={24} color={colors.destructive} />
                <Text
                  style={[typeScale.heading, { color: colors.ink, marginTop: spacing.sm, textAlign: 'center' }]}
                  maxFontSizeMultiplier={1.3}
                >
                  Couldn&apos;t load this folder
                </Text>
                <Text
                  style={[typeScale.body, { color: colors.inkSecondary, marginTop: spacing.xxs, textAlign: 'center' }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {listError}
                </Text>
                <Pressable
                  onPress={() => setRetryToken((t) => t + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                  style={{ marginTop: spacing.md, minHeight: minTouchTarget, justifyContent: 'center' }}
                >
                  <Text style={[typeScale.bodyMedium, { color: colors.destructive }]} maxFontSizeMultiplier={1.3}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.emptyState, { padding: spacing.xl, alignItems: 'center' }]}>
                <Icon icon={FolderOpen} size={24} color={colors.inkSecondary} />
                <Text
                  style={[typeScale.heading, { color: colors.ink, marginTop: spacing.sm, textAlign: 'center' }]}
                  maxFontSizeMultiplier={1.3}
                >
                  This folder is empty
                </Text>
                {currentPath.length > 0 && (
                  <Pressable
                    onPress={() => navigateTo(parentPath(currentPath))}
                    accessibilityRole="button"
                    accessibilityLabel="Back to parent folder"
                    style={{ marginTop: spacing.md, minHeight: minTouchTarget, justifyContent: 'center' }}
                  >
                    <Text style={[typeScale.bodyMedium, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                      ← Back to parent folder
                    </Text>
                  </Pressable>
                )}
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={[
                styles.row,
                { paddingHorizontal: spacing.md, minHeight: minTouchTarget, borderBottomColor: colors.border },
              ]}
            >
              <Icon icon={iconFor(item)} size={20} color={item.type === 'folder' ? colors.accent : colors.inkSecondary} />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[typeScale.body, { color: colors.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {item.name}
                </Text>
                {item.type === 'file' ? (
                  <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                    {formatBytes(item.sizeBytes)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </Animated.View>

      <FileViewerSheet file={viewerFile} textContent={viewerContent} onClose={closeViewer} />
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
    gap: 4,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  breadcrumbBar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  listWrapper: {
    flex: 1,
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyState: {
    alignItems: 'center',
  },
});

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
import { fetchTextChunked } from '../network/chunkedDownload';

type Nav = NativeStackNavigationProp<SessionsStackParamList, 'FileExplorer'>;
type ExplorerRoute = RouteProp<SessionsStackParamList, 'FileExplorer'>;

/** Files over this size skip the automatic preview fetch entirely (Q2 of
 * the file-explorer lazy-loading plan) — the sheet shows metadata +
 * Download/Open-in-browser instead. The folder listing already carries
 * `sizeBytes` for every entry, so this decision costs zero extra round
 * trips: it's made before any fetch starts, not after one times out. */
const MAX_AUTO_PREVIEW_BYTES = 10 * 1024 * 1024;

/** Bytes requested per Range chunk when streaming a text/code file in — see chunkedDownload.ts. */
const TEXT_CHUNK_SIZE = 64 * 1024;

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
  // Flips true only 300ms into a folder fetch, per pig-loading-states'
  // delay-before-show rule, so a fast listing never flashes a skeleton.
  const [showListSkeleton, setShowListSkeleton] = useState(false);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  // Text-file open had no pending state at all before this — the sheet
  // just showed a blank body until fsRead resolved, which is the "screen
  // just kind of freezes" symptom for text/code files specifically.
  const [textLoading, setTextLoading] = useState(false);
  // 0-1 while later chunks are still streaming in behind the first one
  // already on screen; undefined before the first chunk and once done.
  const [textProgress, setTextProgress] = useState<number | undefined>(undefined);
  const [textLoadError, setTextLoadError] = useState<string | null>(null);
  // The node last opened for text preview, kept only so Retry can re-run
  // the same load without the row being tapped again.
  const lastTextNodeRef = useRef<FileNode | null>(null);
  const traverseStyle = useFolderTraverseSlide(currentPath, navDirection);

  const breadcrumbScrollRef = useRef<ScrollView>(null);
  const breadcrumbLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const breadcrumbViewportWidth = useRef(0);
  // Aborts whichever file-open request (fsRead/getRawFileUrl) is currently
  // in flight for the viewer sheet — set on every handlePress, cleared/fired
  // on close, on opening a different file, and on unmount. This is what
  // makes "cancel a load without it blocking everything else" real: the
  // explorer list, breadcrumbs and back button were already unblocked
  // (nothing here runs on the UI thread), but without this the *response*
  // to an abandoned open could still land later and overwrite whatever the
  // user opened next (see bridgeClient.ts's WithRequestId doc).
  const openFileAbortRef = useRef<AbortController | null>(null);

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
    const skeletonTimer = setTimeout(() => {
      if (!cancelled) setShowListSkeleton(true);
    }, 300);
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
      })
      .finally(() => {
        if (cancelled) return;
        clearTimeout(skeletonTimer);
        setShowListSkeleton(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(skeletonTimer);
    };
  }, [client, currentPath, retryToken]);

  // Cancel whatever file-open request is still in flight when the screen
  // itself unmounts (e.g. navigating back mid-load).
  useEffect(() => {
    return () => {
      openFileAbortRef.current?.abort();
    };
  }, []);

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

  /**
   * Streams a text/code file in over the raw-file HTTP endpoint's Range
   * support, TEXT_CHUNK_SIZE bytes at a time (chunkedDownload.ts), instead
   * of the old single all-or-nothing `fsRead`. Each chunk both extends
   * `viewerContent` (so the sheet shows a real, growing prefix of the file
   * rather than nothing until the whole thing lands) and updates
   * `textProgress` for the determinate progress bar. Split out from
   * `handlePress` so Retry (on a failed chunk request) can re-run the exact
   * same load without the row being tapped again.
   */
  const loadTextPreview = useCallback(
    async (node: FileNode, controller: AbortController) => {
      if (!client) {
        setTextLoading(false);
        return;
      }
      lastTextNodeRef.current = node;
      setTextLoadError(null);
      setTextLoading(true);
      setTextProgress(undefined);
      let receivedFirstChunk = false;
      try {
        const url = await client.getRawFileUrl(node.path, controller.signal);
        if (controller.signal.aborted) return;
        await fetchTextChunked(url, {
          chunkSize: TEXT_CHUNK_SIZE,
          signal: controller.signal,
          onChunk: (textSoFar, loaded, total) => {
            if (controller.signal.aborted) return;
            setViewerContent(textSoFar);
            if (!receivedFirstChunk) {
              receivedFirstChunk = true;
              setTextLoading(false);
            }
            // total undefined (server didn't report a size) reads as "still
            // going" rather than silently hiding the progress bar.
            setTextProgress(total !== undefined && loaded >= total ? undefined : total !== undefined ? loaded / total : 0);
          },
        });
        if (!controller.signal.aborted) setTextProgress(undefined);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        // A failure after some content already rendered keeps that partial
        // content on screen (still real, still useful) and surfaces the
        // error+Retry alongside it, rather than blanking out what loaded
        // successfully — per pig-network-states, a failed action doesn't
        // discard what it already had.
        setTextLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setTextLoading(false);
          setTextProgress(undefined);
        }
      }
    },
    [client],
  );

  const retryTextLoad = useCallback(() => {
    const node = lastTextNodeRef.current;
    if (!node) return;
    openFileAbortRef.current?.abort();
    const controller = new AbortController();
    openFileAbortRef.current = controller;
    void loadTextPreview(node, controller);
  }, [loadTextPreview]);

  const cancelActiveLoad = useCallback(() => {
    // Same effect as closing the sheet's load without actually closing the
    // sheet — per pig-network-states' cancellation rule, this returns to a
    // neutral resting state (no error styling) rather than Failed.
    openFileAbortRef.current?.abort();
    setTextLoading(false);
    setTextProgress(undefined);
    setImageLoading(false);
  }, []);

  const handlePress = useCallback(
    async (node: FileNode) => {
      if (node.type === 'folder') {
        navigateTo(node.path);
        return;
      }
      // Cancel whatever the previous file open was still waiting on — its
      // response is no longer wanted and, per bridgeClient's requestId
      // matching, will now just be dropped instead of racing this one.
      openFileAbortRef.current?.abort();
      const controller = new AbortController();
      openFileAbortRef.current = controller;

      const kind = kindForMimeType(node.mimeType);
      const tooLargeToPreview =
        (kind === 'text' || kind === 'image') && node.sizeBytes !== undefined && node.sizeBytes > MAX_AUTO_PREVIEW_BYTES;
      setViewerFile({
        name: node.name,
        path: node.path,
        kind,
        mimeType: node.mimeType,
        sizeBytes: node.sizeBytes,
        ...(tooLargeToPreview
          ? {
              previewSkippedReason: `Too large to preview in-app (over ${formatBytes(MAX_AUTO_PREVIEW_BYTES)}) — download or open in browser instead.`,
            }
          : {}),
      });
      setImageLoadFailed(false);
      setTextLoadError(null);
      setViewerContent(undefined);
      if (tooLargeToPreview) {
        return;
      }
      if (kind === 'text') {
        await loadTextPreview(node, controller);
      } else if (kind === 'image') {
        if (client) {
          setImageLoading(true);
          try {
            const url = await client.getRawFileUrl(node.path, controller.signal);
            if (controller.signal.aborted) return;
            setViewerFile((prev) => (prev && prev.path === node.path ? { ...prev, imageUri: url } : prev));
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            setImageLoadFailed(true);
          } finally {
            if (!controller.signal.aborted) setImageLoading(false);
          }
        }
      }
    },
    [client, navigateTo, loadTextPreview],
  );

  const closeViewer = useCallback(() => {
    // This is the cancel: dismissing the sheet (X, swipe-down, backdrop tap)
    // while a file is still loading now actually stops that load instead of
    // letting it finish in the background and silently do nothing with the
    // result — and it never blocked the rest of the screen to begin with,
    // since the explorer list/breadcrumbs/back button sit above this in the
    // same tree and were never disabled while a file loads.
    openFileAbortRef.current?.abort();
    setViewerFile(null);
    setViewerContent(undefined);
    setImageLoading(false);
    setImageLoadFailed(false);
    setTextLoading(false);
    setTextProgress(undefined);
    setTextLoadError(null);
    lastTextNodeRef.current = null;
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
        {showListSkeleton ? (
          // Skeleton, not a spinner, per pig-loading-states' decision rule:
          // a folder row's shape (icon + name + size) is already known, so
          // this previews that shape instead of showing an indeterminate
          // spinner over blank space while fsList is in flight.
          <View style={{ paddingTop: spacing.xs }} accessibilityLabel="Loading folder contents">
            {[0, 1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  styles.row,
                  { paddingHorizontal: spacing.md, minHeight: minTouchTarget, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.skeletonIcon, { backgroundColor: colors.border }]} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <View
                    style={[
                      styles.skeletonLine,
                      { backgroundColor: colors.border, width: `${45 - i * 4}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
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
        )}
      </Animated.View>

      <FileViewerSheet
        file={viewerFile}
        textContent={viewerContent}
        textLoading={textLoading}
        textProgress={textProgress}
        textLoadError={textLoadError}
        onRetryText={retryTextLoad}
        onCancelLoad={cancelActiveLoad}
        imageLoading={imageLoading}
        imageLoadFailed={imageLoadFailed}
        onClose={closeViewer}
      />
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
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    opacity: 0.6,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
    opacity: 0.6,
  },
});

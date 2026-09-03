import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, File, FileText, Folder, FolderOpen, Image as ImageIcon } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { useFolderTraverseSlide } from '../theme/motion';
import type { SessionsStackParamList } from '../navigation/SessionsStackNavigator';
import type { FileNode } from '../types';
import { mockFileContents, mockFileTree } from '../fixtures/files';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';

type Nav = NativeStackNavigationProp<SessionsStackParamList, 'FileExplorer'>;

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
  const [currentPath, setCurrentPath] = useState('');
  const [navDirection, setNavDirection] = useState<'forward' | 'back'>('forward');
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);
  const traverseStyle = useFolderTraverseSlide(currentPath, navDirection);

  const breadcrumbScrollRef = useRef<ScrollView>(null);
  const breadcrumbLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const breadcrumbViewportWidth = useRef(0);

  /** Navigate to `path`, inferring forward/back from the depth change for the slide direction. */
  const navigateTo = useCallback(
    (path: string) => {
      setNavDirection(pathDepth(path) >= pathDepth(currentPath) ? 'forward' : 'back');
      setCurrentPath(path);
    },
    [currentPath],
  );

  const entries = useMemo(() => {
    const children = mockFileTree.filter((node) => parentPath(node.path) === currentPath);
    return [...children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [currentPath]);

  const breadcrumbs = useMemo(() => {
    const segments = currentPath ? currentPath.split('/') : [];
    const crumbs: { label: string; path: string }[] = [{ label: 'Working folder', path: '' }];
    let built = '';
    for (const segment of segments) {
      built = built ? `${built}/${segment}` : segment;
      crumbs.push({ label: segment, path: built });
    }
    return crumbs;
  }, [currentPath]);

  const handlePress = useCallback(
    (node: FileNode) => {
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
      setViewerContent(kind === 'text' ? mockFileContents[node.path] : undefined);
    },
    [navigateTo],
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

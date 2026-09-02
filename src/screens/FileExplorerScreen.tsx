import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File, FileText, Folder, Image as ImageIcon } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import type { FileNode } from '../types';
import { mockFileContents, mockFileTree } from '../fixtures/files';
import { FileViewerSheet, type ViewableFile } from '../components/FileViewerSheet';

function parentPath(path: string): string {
  const segments = path.split('/');
  segments.pop();
  return segments.join('/');
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
  const [currentPath, setCurrentPath] = useState('');
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);
  const [viewerContent, setViewerContent] = useState<string | undefined>(undefined);

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

  const handlePress = useCallback((node: FileNode) => {
    if (node.type === 'folder') {
      setCurrentPath(node.path);
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
  }, []);

  const closeViewer = useCallback(() => {
    setViewerFile(null);
    setViewerContent(undefined);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.breadcrumbBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: spacing.md, alignItems: 'center' }}
      >
        {breadcrumbs.map((crumb, index) => (
          <View key={crumb.path} style={styles.crumbRow}>
            {index > 0 ? (
              <Text style={[typeScale.body, { color: colors.inkSecondary, marginHorizontal: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
                /
              </Text>
            ) : null}
            <Pressable
              onPress={() => setCurrentPath(crumb.path)}
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

      <FlatList
        data={entries}
        keyExtractor={(item) => item.path}
        contentContainerStyle={{ paddingVertical: spacing.xs }}
        ListEmptyComponent={
          <View style={[styles.emptyState, { padding: spacing.lg }]}>
            <Text style={[typeScale.body, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
              This folder is empty.
            </Text>
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

      <FileViewerSheet file={viewerFile} textContent={viewerContent} onClose={closeViewer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  breadcrumbBar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
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

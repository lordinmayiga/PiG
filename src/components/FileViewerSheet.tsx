import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Download, File, FileText, X } from 'lucide-react-native';

import { Icon, useTheme } from '../theme';
import { isReduceMotionEnabled } from '../theme/motion';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';

/** Damped-spring feel for the sheet entrance/dismiss, per pig-motion's sheet convention. */
const SHEET_SPRING = { damping: 20, stiffness: 140, mass: 0.8 };
/** Downward drag distance (px) past which a release dismisses the sheet. */
const DISMISS_THRESHOLD = 120;
/** Downward fling velocity (px/s) that dismisses regardless of distance dragged. */
const DISMISS_VELOCITY = 800;
const SHEET_DISMISS_DISTANCE = 600;

/**
 * Minimal shape both TranscriptScreen (FileAttachment) and
 * FileExplorerScreen (FileNode) can map to, so the two screens share one
 * viewer sheet per SPEC.md §3.6's "reuse the transcript file-viewer" call.
 */
export interface ViewableFile {
  name: string;
  path: string;
  kind: 'image' | 'text' | 'other';
  mimeType?: string;
  sizeBytes?: number;
  /** Real local/device URI, when one exists (e.g. a just-picked photo) — rendered in the lightbox instead of the fixture placeholder. */
  imageUri?: string;
}

interface FileViewerSheetProps {
  file: ViewableFile | null;
  /** Text-file body, resolved by the caller (fixture lookup) — only read for kind: 'text'. */
  textContent?: string;
  onClose: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Shared in-chat / file-explorer viewer, split by type per SPEC.md §6.1 and
 * pig-markdown-rendering: image → full-screen lightbox, text/code →
 * monospace read-only, anything else → metadata + Download only (stubbed —
 * no real OS share-sheet wiring yet).
 */
export function FileViewerSheet({ file, textContent, onClose }: FileViewerSheetProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  const monoLoaded = useMonoFont();
  const [toastVisible, setToastVisible] = useState(false);
  // Reset the toast when a new file opens, without an effect (react-hooks/set-state-in-effect) —
  // adjust state during render by comparing against the last-seen file path.
  const [lastFilePath, setLastFilePath] = useState(file?.path);
  if (file?.path !== lastFilePath) {
    setLastFilePath(file?.path);
    if (toastVisible) setToastVisible(false);
  }

  const handleDownload = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  // Drag-down-to-dismiss for the (non-image) bottom sheet — a Reanimated
  // shared value driven both by the entrance/dismiss animations below and
  // by the pan gesture's live drag offset.
  const sheetTranslateY = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  useEffect(() => {
    if (!file || file.kind === 'image') return;
    if (isReduceMotionEnabled()) {
      sheetTranslateY.value = 0;
      return;
    }
    sheetTranslateY.value = 300;
    sheetTranslateY.value = withSpring(0, SHEET_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path, file?.kind]);

  const dismissViaGesture = () => {
    if (isReduceMotionEnabled()) {
      onClose();
      return;
    }
    sheetTranslateY.value = withTiming(SHEET_DISMISS_DISTANCE, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartY.value = sheetTranslateY.value;
    })
    .onUpdate((event) => {
      sheetTranslateY.value = Math.max(0, dragStartY.value + event.translationY);
    })
    .onEnd((event) => {
      if (sheetTranslateY.value > DISMISS_THRESHOLD || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(dismissViaGesture)();
      } else {
        sheetTranslateY.value = withSpring(0, SHEET_SPRING);
      }
    });

  const sheetDragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  if (!file) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close file viewer" />

        {file.kind === 'image' ? (
          <View style={[styles.lightbox, { backgroundColor: colors.ink }]}>
            {file.imageUri ? (
              <Image source={{ uri: file.imageUri }} style={styles.lightboxImage} resizeMode="contain" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon icon={FileText} size={24} color={colors.canvas} />
                <Text style={[typeScale.subheading, { color: colors.canvas, marginTop: spacing.sm }]} maxFontSizeMultiplier={1.3}>
                  {file.name}
                </Text>
                <Text style={[typeScale.caption, { color: colors.canvas, marginTop: spacing.xxs, opacity: 0.7 }]} maxFontSizeMultiplier={1.3}>
                  Preview not available in this build — image fixture only
                </Text>
              </View>
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              style={[styles.closeButton, { backgroundColor: colors.scrim }]}
            >
              <Icon icon={X} size={20} color={colors.canvas} />
            </Pressable>
          </View>
        ) : (
          // GestureHandlerRootView is required here (not just once at the app root) because
          // react-native-gesture-handler needs its own root inside a native Modal on iOS.
          <GestureHandlerRootView style={styles.sheetGestureRoot}>
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={[
                  styles.sheet,
                  sheetDragStyle,
                  { backgroundColor: colors.elevated, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
                ]}
              >
                <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
                <View style={[styles.sheetHeader, { paddingHorizontal: spacing.md, paddingTop: spacing.xxs }]}>
                  <Text style={[typeScale.subheading, { color: colors.ink, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {file.name}
                  </Text>
                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
                    <Icon icon={X} size={24} color={colors.inkSecondary} />
                  </Pressable>
                </View>

                {file.kind === 'text' ? (
                  <ScrollView
                    style={{
                      maxHeight: 420,
                      margin: spacing.md,
                      backgroundColor: colors.canvas,
                      borderRadius: radius.chip,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                    }}
                  >
                    <ScrollView horizontal>
                      <Text
                        selectable
                        style={[
                          styles.codeText,
                          { color: colors.ink, padding: spacing.sm, fontFamily: monoLoaded ? monoFontFamily.regular : monoFontFallback },
                        ]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {textContent ?? ''}
                      </Text>
                    </ScrollView>
                  </ScrollView>
                ) : (
                  <View style={{ padding: spacing.md, gap: spacing.xs }}>
                    <View style={styles.metaRow}>
                      <Icon icon={File} size={20} color={colors.inkSecondary} />
                      <View style={{ marginLeft: spacing.sm }}>
                        <Text style={[typeScale.body, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
                          {file.mimeType ?? 'Unknown type'}
                        </Text>
                        <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                          {formatBytes(file.sizeBytes)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                      No in-app preview for this file type.
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={handleDownload}
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${file.name}`}
                  style={[
                    styles.downloadButton,
                    { backgroundColor: colors.accent, borderRadius: radius.pill, margin: spacing.md, marginTop: file.kind === 'text' ? 0 : spacing.xs },
                  ]}
                >
                  <Icon icon={Download} size={20} color={colors.onAccent} />
                  <Text style={[typeScale.label, { color: colors.onAccent, marginLeft: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
                    Download
                  </Text>
                </Pressable>

                {toastVisible ? (
                  <View style={[styles.toast, { backgroundColor: colors.ink, borderRadius: radius.chip, bottom: spacing.xxl }]}>
                    <Text style={[typeScale.caption, { color: colors.canvas }]} maxFontSizeMultiplier={1.3}>
                      Saved to device (stub) — share sheet wiring lands later
                    </Text>
                  </View>
                ) : null}
              </Animated.View>
            </GestureDetector>
          </GestureHandlerRootView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  lightbox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGestureRoot: {
    // Sizes to its Animated.View child, sitting at the bottom of the scrim
    // (styles.scrim is justifyContent: 'flex-end') rather than filling the screen.
    flexShrink: 1,
  },
  sheet: {
    maxHeight: '80%',
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});

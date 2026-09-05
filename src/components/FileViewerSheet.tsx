import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { AlertCircle, Download, File, FileText, Globe, Maximize2, Minimize2, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { Icon, useTheme } from '../theme';
import { isReduceMotionEnabled } from '../theme/motion';
import { monoFontFallback, monoFontFamily, useMonoFont } from './monoFont';
import { MarkdownBody } from './MarkdownBody';
import { CodeHighlight, languageForFilename } from './CodeHighlight';
import { useBridge } from '../contexts/BridgeContext';

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
  /** Set instead of attempting a preview when the file is over the auto-preview size threshold — the sheet falls back to its metadata-only body (as for kind: 'other') regardless of `kind`, showing this as the explanation. */
  previewSkippedReason?: string;
}

interface FileViewerSheetProps {
  file: ViewableFile | null;
  /** Text-file body, resolved by the caller — only read for kind: 'text'. Populated progressively as chunks arrive, so this can be a prefix of the full file while loading continues. */
  textContent?: string;
  /** True while the caller is resolving a real image URL (client.getRawFileUrl) for a kind: 'image' file with no imageUri yet. */
  imageLoading?: boolean;
  /** True once that resolution has been attempted and failed — distinct from "never attempted" (no client / fixture-only build), which keeps the old placeholder copy. */
  imageLoadFailed?: boolean;
  /** True only until the *first* chunk of text content has arrived — the spinner phase, per pig-loading-states (no content shape to preview yet). */
  textLoading?: boolean;
  /** 0-1 once the first chunk has rendered and more are still loading; undefined once the whole file has arrived or loading hasn't started. Drives the determinate progress bar (pig-loading-states) shown *under* the already-visible partial content — a different phase from `textLoading`'s spinner. */
  textProgress?: number;
  /** Set when a chunk request failed (not cancelled) after at least one chunk may have already rendered. */
  textLoadError?: string | null;
  /** Re-attempts the text load from the start — wired to the inline error state's Retry per pig-network-states. */
  onRetryText?: () => void;
  /** Cancels whichever load (text or image) is currently pending — shown as an explicit action per pig-network-states' cancellation section, not just an implicit "close and hope it stops". */
  onCancelLoad?: () => void;
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
 * monospace or markdown preview, anything else → metadata + Download.
 */
export function FileViewerSheet({
  file,
  textContent,
  imageLoading,
  imageLoadFailed,
  textLoading,
  textProgress,
  textLoadError,
  onRetryText,
  onCancelLoad,
  onClose,
}: FileViewerSheetProps) {
  const { colors, spacing, radius, typeScale } = useTheme();
  const monoLoaded = useMonoFont();
  const navigation = useNavigation<any>();
  // A file over the auto-preview threshold falls back to the metadata-only
  // body regardless of its real kind — the caller sets previewSkippedReason
  // instead of ever starting a fetch for it, so there's nothing here to
  // show but the explanation + Download/Open-in-browser. Computed up top
  // (not just at render time below) so the sheet-vs-lightbox entrance
  // effect further down agrees with what actually renders.
  const effectiveKind = file?.previewSkippedReason ? 'other' : file?.kind;
  const { client, host } = useBridge();

  const [toastVisible, setToastVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  // 300ms delay-before-show per pig-loading-states, so a fast image load never flashes a spinner.
  const [showImageSpinner, setShowImageSpinner] = useState(false);
  // Same delay-before-show rule applied to text/code, which previously had
  // no pending state at all — the sheet just showed a blank body.
  const [showTextSpinner, setShowTextSpinner] = useState(false);

  useEffect(() => {
    if (!imageLoading) return;
    const timer = setTimeout(() => setShowImageSpinner(true), 300);
    // Runs both on unmount and whenever a dependency changes (imageLoading
    // flipping to false, or a new file opening) — either way the spinner
    // should stop showing, so the reset lives here rather than as a
    // synchronous setState in the effect body itself.
    return () => {
      clearTimeout(timer);
      setShowImageSpinner(false);
    };
  }, [imageLoading, file?.path]);

  useEffect(() => {
    if (!textLoading) return;
    const timer = setTimeout(() => setShowTextSpinner(true), 300);
    return () => {
      clearTimeout(timer);
      setShowTextSpinner(false);
    };
  }, [textLoading, file?.path]);

  // Reset states when a new file opens
  const [lastFilePath, setLastFilePath] = useState(file?.path);
  if (file?.path !== lastFilePath) {
    setLastFilePath(file?.path);
    if (toastVisible) setToastVisible(false);
    if (fullscreen) setFullscreen(false);
    if (showRaw) setShowRaw(false);
  }

  const isMarkdown =
    file?.kind === 'text' &&
    (file.mimeType === 'text/markdown' ||
      file.name.toLowerCase().endsWith('.md') ||
      file.name.toLowerCase().endsWith('.markdown'));

  const codeLanguage = file?.kind === 'text' && !isMarkdown ? languageForFilename(file.name) : undefined;

  const isHtml =
    file?.mimeType === 'text/html' ||
    file?.name.toLowerCase().endsWith('.html') ||
    file?.name.toLowerCase().endsWith('.htm');

  const handleDownload = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleOpenInBrowser = async () => {
    if (!file) return;
    try {
      let targetUrl = '';
      if (client) {
        try {
          targetUrl = await client.getRawFileUrl(file.path);
        } catch {
          // Fallback if request fails
        }
      }
      if (!targetUrl && host) {
        // Fallback if the WS request failed — build against the paired
        // host, not "localhost" (which resolves to this device/browser,
        // not the VPS running the bridge, and would also trip the
        // browser's cross-origin Private Network Access check).
        targetUrl = `http://${host}/files/raw?path=${encodeURIComponent(file.path)}`;
      }
      if (!targetUrl) {
        console.error('Failed to open in browser: no bridge connection to resolve a URL from');
        return;
      }
      onClose();
      // Navigate to Browser tab
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate('Browser', { initialUrl: targetUrl });
      } else {
        navigation.navigate('Browser', { initialUrl: targetUrl });
      }
    } catch (err) {
      console.error('Failed to open in browser:', err);
    }
  };

  // Drag-down-to-dismiss for the bottom sheet
  const sheetTranslateY = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  useEffect(() => {
    if (!file || effectiveKind === 'image') return;
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
        if (fullscreen) {
          // First drag down collapses fullscreen back to sheet
          runOnJS(setFullscreen)(false);
          sheetTranslateY.value = withSpring(0, SHEET_SPRING);
        } else {
          runOnJS(dismissViaGesture)();
        }
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
      <View style={[styles.scrim, { backgroundColor: colors.scrim }, fullscreen && styles.scrimFullscreen]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close file viewer" />

        {effectiveKind === 'image' ? (
          <View style={[styles.lightbox, { backgroundColor: colors.ink }]}>
            {file.imageUri ? (
              <Image source={{ uri: file.imageUri }} style={styles.lightboxImage} resizeMode="contain" />
            ) : showImageSpinner ? (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="large" color={colors.canvas} />
                {onCancelLoad && (
                  <Pressable onPress={onCancelLoad} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} style={{ marginTop: spacing.md }}>
                    <Text style={[typeScale.bodyMedium, { color: colors.canvas }]} maxFontSizeMultiplier={1.3}>
                      Cancel
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : imageLoadFailed ? (
              <View style={styles.imagePlaceholder}>
                <Icon icon={AlertCircle} size={24} color={colors.canvas} />
                <Text style={[typeScale.subheading, { color: colors.canvas, marginTop: spacing.sm }]} maxFontSizeMultiplier={1.3}>
                  {file.name}
                </Text>
                <Text style={[typeScale.caption, { color: colors.canvas, marginTop: spacing.xxs, opacity: 0.7 }]} maxFontSizeMultiplier={1.3}>
                  Couldn&apos;t load this image
                </Text>
              </View>
            ) : !imageLoading ? (
              <View style={styles.imagePlaceholder}>
                <Icon icon={FileText} size={24} color={colors.canvas} />
                <Text style={[typeScale.subheading, { color: colors.canvas, marginTop: spacing.sm }]} maxFontSizeMultiplier={1.3}>
                  {file.name}
                </Text>
                <Text style={[typeScale.caption, { color: colors.canvas, marginTop: spacing.xxs, opacity: 0.7 }]} maxFontSizeMultiplier={1.3}>
                  Preview not available in this build — image fixture only
                </Text>
              </View>
            ) : null}
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
          <GestureHandlerRootView style={[styles.sheetGestureRoot, fullscreen && styles.sheetGestureRootFullscreen]}>
            <GestureDetector gesture={panGesture}>
              <Animated.View
                testID="file-viewer-sheet"
                style={[
                  styles.sheet,
                  fullscreen
                    ? styles.sheetFullscreen
                    : {
                        borderTopLeftRadius: radius.sheet,
                        borderTopRightRadius: radius.sheet,
                      },
                  sheetDragStyle,
                  { backgroundColor: colors.elevated },
                ]}
              >
                {!fullscreen && <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />}
                <View style={[styles.sheetHeader, { paddingHorizontal: spacing.md, paddingTop: fullscreen ? spacing.md : spacing.xxs }]}>
                  <Text style={[typeScale.subheading, { color: colors.ink, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {file.name}
                  </Text>

                  {isMarkdown && (
                    <View style={[styles.pillContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Pressable
                        onPress={() => setShowRaw(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Preview"
                        style={[styles.pillButton, !showRaw && { backgroundColor: colors.accent }]}
                      >
                        <Text style={[typeScale.caption, { color: !showRaw ? colors.onAccent : colors.inkSecondary }]}>
                          Preview
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setShowRaw(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Raw"
                        style={[styles.pillButton, showRaw && { backgroundColor: colors.accent }]}
                      >
                        <Text style={[typeScale.caption, { color: showRaw ? colors.onAccent : colors.inkSecondary }]}>
                          Raw
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <Pressable
                    onPress={() => setFullscreen((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel={fullscreen ? 'Collapse to sheet' : 'Expand to fullscreen'}
                    hitSlop={12}
                    style={{ marginHorizontal: spacing.xs }}
                  >
                    <Icon icon={fullscreen ? Minimize2 : Maximize2} size={20} color={colors.inkSecondary} />
                  </Pressable>

                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
                    <Icon icon={X} size={24} color={colors.inkSecondary} />
                  </Pressable>
                </View>

                {effectiveKind === 'text' ? (
                  <>
                    <ScrollView
                      style={[
                        styles.textScroller,
                        fullscreen ? styles.textScrollerFullscreen : { maxHeight: 420 },
                        {
                          margin: spacing.md,
                          marginBottom: textProgress !== undefined ? spacing.xxs : spacing.md,
                          backgroundColor: colors.canvas,
                          borderRadius: radius.chip,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {textLoadError ? (
                        <View style={styles.textLoading}>
                          <Icon icon={AlertCircle} size={20} color={colors.destructive} />
                          <Text style={[typeScale.body, { color: colors.ink, marginTop: spacing.sm, textAlign: 'center' }]} maxFontSizeMultiplier={1.3}>
                            {textLoadError}
                          </Text>
                          {onRetryText && (
                            <Pressable onPress={onRetryText} accessibilityRole="button" accessibilityLabel="Retry" style={{ marginTop: spacing.sm }}>
                              <Text style={[typeScale.bodyMedium, { color: colors.destructive }]} maxFontSizeMultiplier={1.3}>
                                Retry
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ) : textContent === undefined && showTextSpinner ? (
                        <View style={styles.textLoading}>
                          <ActivityIndicator size="small" color={colors.inkSecondary} />
                          {onCancelLoad && (
                            <Pressable onPress={onCancelLoad} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} style={{ marginTop: spacing.sm }}>
                              <Text style={[typeScale.bodyMedium, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                                Cancel
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ) : isMarkdown && !showRaw ? (
                        <View style={{ padding: spacing.sm }} testID="formatted-markdown-body">
                          <MarkdownBody content={textContent ?? ''} />
                        </View>
                      ) : !isMarkdown && codeLanguage ? (
                        <ScrollView horizontal testID="highlighted-code-source" contentContainerStyle={{ padding: spacing.sm }}>
                          <CodeHighlight code={textContent ?? ''} language={codeLanguage} />
                        </ScrollView>
                      ) : (
                        <ScrollView horizontal testID="raw-markdown-source">
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
                      )}
                    </ScrollView>

                    {/* Determinate progress per pig-loading-states: content is already
                        showing above (a real prefix of the file), this is "loading
                        more" — an element-level indicator, not a screen block — with
                        its own Cancel per pig-network-states' cancellation rule. */}
                    {textProgress !== undefined ? (
                      <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm }}>
                        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                          <View
                            style={[
                              styles.progressFill,
                              { backgroundColor: colors.accent, width: `${Math.min(100, Math.round(textProgress * 100))}%` },
                            ]}
                          />
                        </View>
                        <View style={[styles.progressRow, { marginTop: spacing.xxs }]}>
                          <Text style={[typeScale.caption, { color: colors.inkSecondary }]} maxFontSizeMultiplier={1.3}>
                            Loading {Math.round(textProgress * 100)}%
                          </Text>
                          {onCancelLoad && (
                            <Pressable onPress={onCancelLoad} accessibilityRole="button" accessibilityLabel="Cancel">
                              <Text style={[typeScale.caption, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                                Cancel
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ) : null}
                  </>
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
                      {file.previewSkippedReason ?? 'No in-app preview for this file type.'}
                    </Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  {isHtml && (
                    <Pressable
                      onPress={handleOpenInBrowser}
                      accessibilityRole="button"
                      accessibilityLabel="Open in browser"
                      style={[
                        styles.actionButton,
                        styles.openBrowserButton,
                        {
                          borderColor: colors.accent,
                          borderRadius: radius.pill,
                          backgroundColor: colors.canvas,
                          marginHorizontal: spacing.md,
                          marginBottom: spacing.xs,
                        },
                      ]}
                    >
                      <Icon icon={Globe} size={16} color={colors.accent} />
                      <Text style={[typeScale.label, { color: colors.accent, marginLeft: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
                        Open in browser
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={handleDownload}
                    accessibilityRole="button"
                    accessibilityLabel={`Download ${file.name}`}
                    style={[
                      styles.actionButton,
                      styles.downloadButton,
                      {
                        backgroundColor: colors.accent,
                        borderRadius: radius.pill,
                        marginHorizontal: spacing.md,
                        marginBottom: spacing.md,
                        marginTop: effectiveKind === 'text' && !isHtml ? 0 : spacing.xs,
                      },
                    ]}
                  >
                    <Icon icon={Download} size={16} color={colors.onAccent} />
                    <Text style={[typeScale.label, { color: colors.onAccent, marginLeft: spacing.xxs }]} maxFontSizeMultiplier={1.3}>
                      Download
                    </Text>
                  </Pressable>
                </View>

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
  scrimFullscreen: {
    justifyContent: 'flex-start',
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
    flexShrink: 1,
  },
  sheetGestureRootFullscreen: {
    flex: 1,
  },
  sheet: {
    maxHeight: '80%',
  },
  sheetFullscreen: {
    flex: 1,
    maxHeight: '100%',
    height: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginRight: 8,
  },
  pillButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  textScroller: {},
  textScrollerFullscreen: {
    flex: 1,
  },
  textLoading: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  openBrowserButton: {
    borderWidth: 1,
  },
  downloadButton: {},
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});

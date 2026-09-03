import { useEffect, useRef, useState } from 'react';
import { Globe, Monitor, RefreshCw, RotateCcw, Smartphone, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import type { WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TabStrip } from '../components/TabStrip';
import { createBlankTab, DESKTOP_USER_AGENT, type BrowserTab } from '../fixtures/browser';
import { useTheme } from '../theme';
import { isReduceMotionEnabled } from '../theme/motion';
import { Icon, iconSizes } from '../theme/icons';

/**
 * Embedded browser (SPEC.md §3.4, §9): tab strip over a native WebView,
 * with refresh, hard refresh, clear local storage, and a desktop/mobile
 * user-agent toggle. Each open tab keeps its own WebView mounted (hidden
 * when inactive) so switching tabs doesn't lose scroll position or JS
 * state — only the active tab's WebView is visible.
 *
 * `react-native-webview` renders a native view with no browser DOM
 * available in this sandbox, so it won't visibly load pages while testing
 * here — the tab/control state management is verified independent of that.
 */
export default function BrowserScreen() {
  const { colors, spacing, radius, typeScale, screenMargin, maxFontScale, minTouchTarget } = useTheme();

  const [tabs, setTabs] = useState<BrowserTab[]>(() => [createBlankTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const webviewRefs = useRef<Record<string, WebView | null>>({});

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const loadProgress = useSharedValue(0);
  const loadProgressOpacity = useSharedValue(0);

  const handleLoadProgress = (id: string, event: WebViewProgressEvent) => {
    if (id !== activeTabId) return;
    const progress = event.nativeEvent.progress;
    if (isReduceMotionEnabled()) {
      loadProgress.value = progress;
    } else {
      loadProgress.value = withTiming(progress, { duration: 150, easing: Easing.out(Easing.cubic) });
    }
    loadProgressOpacity.value = progress >= 1 ? withTiming(0, { duration: 220 }) : 1;
  };

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${loadProgress.value * 100}%`,
    opacity: loadProgressOpacity.value,
  }));

  useEffect(() => {
    loadProgress.value = 0;
    loadProgressOpacity.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  const updateTab = (id: string, patch: Partial<BrowserTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const handleNewTab = () => {
    const tab = createBlankTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleCloseTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      delete webviewRefs.current[id];
      if (next.length === 0) {
        const fresh = createBlankTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
      if (id === activeTabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  };

  const navigateActiveTab = () => {
    const raw = activeTab.addressDraft.trim();
    if (!raw) return;
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    updateTab(activeTab.id, { url, addressDraft: url, title: url });
  };

  const handleNavigationStateChange = (id: string, nav: WebViewNavigation) => {
    updateTab(id, {
      title: nav.title || nav.url,
      url: nav.url,
      addressDraft: nav.url,
    });
  };

  const refresh = () => {
    webviewRefs.current[activeTab.id]?.reload();
  };

  const hardRefresh = () => {
    // Force a fresh network fetch, bypassing the WebView's resource cache.
    webviewRefs.current[activeTab.id]?.clearCache(true);
    updateTab(activeTab.id, { reloadKey: activeTab.reloadKey + 1 });
  };

  const clearLocalStorage = () => {
    webviewRefs.current[activeTab.id]?.injectJavaScript(
      'window.localStorage.clear(); window.sessionStorage.clear(); true;',
    );
  };

  const toggleUserAgent = () => {
    const nextMode = activeTab.uaMode === 'mobile' ? 'desktop' : 'mobile';
    // Changing the user agent only takes effect on the next load, so this
    // also bumps reloadKey to remount the WebView with the new UA applied.
    updateTab(activeTab.id, { uaMode: nextMode, reloadKey: activeTab.reloadKey + 1 });
  };

  const hasPage = activeTab.url.length > 0;
  const controlsDisabled = !hasPage;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]} edges={['top', 'bottom']}>
      <TabStrip
        tabs={tabs}
        activeTabId={activeTab.id}
        onSelect={setActiveTabId}
        onClose={handleCloseTab}
        onNewTab={handleNewTab}
      />

      <View
        style={[
          styles.addressRow,
          { paddingHorizontal: screenMargin, paddingVertical: spacing.xs, gap: spacing.xs, borderBottomColor: colors.border },
        ]}
      >
        <TextInput
          value={activeTab.addressDraft}
          onChangeText={(text) => updateTab(activeTab.id, { addressDraft: text })}
          onSubmitEditing={navigateActiveTab}
          placeholder="Enter an address"
          placeholderTextColor={colors.inkPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          maxFontSizeMultiplier={maxFontScale}
          style={[
            typeScale.body,
            styles.addressInput,
            {
              color: colors.ink,
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius.pill,
              minHeight: minTouchTarget,
              paddingHorizontal: spacing.sm,
            },
          ]}
        />
        <Pressable
          onPress={navigateActiveTab}
          accessibilityRole="button"
          accessibilityLabel="Go to address"
          style={({ pressed }) => [
            styles.goButton,
            {
              minWidth: minTouchTarget,
              minHeight: minTouchTarget,
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={[typeScale.label, { color: colors.onAccent }]}>
            Go
          </Text>
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressBar, progressBarStyle, { backgroundColor: colors.accent }]} />
      </View>

      <View
        style={[
          styles.controlsRow,
          { paddingHorizontal: screenMargin, paddingVertical: spacing.xs, gap: spacing.lg, borderBottomColor: colors.border },
        ]}
      >
        <ControlButton
          icon={RefreshCw}
          label="Refresh"
          disabled={controlsDisabled}
          onPress={refresh}
        />
        <ControlButton
          icon={RotateCcw}
          label="Hard refresh"
          disabled={controlsDisabled}
          onPress={hardRefresh}
        />
        <ControlButton
          icon={Trash2}
          label="Clear storage"
          disabled={controlsDisabled}
          onPress={clearLocalStorage}
        />
        <ControlButton
          icon={activeTab.uaMode === 'mobile' ? Monitor : Smartphone}
          label={activeTab.uaMode === 'mobile' ? 'Desktop site' : 'Mobile site'}
          disabled={controlsDisabled}
          onPress={toggleUserAgent}
        />
      </View>

      <View style={styles.webviewArea}>
        {tabs
          .filter((tab) => tab.url.length > 0)
          .map((tab) => (
            <View
              key={tab.id}
              style={[StyleSheet.absoluteFill, { display: tab.id === activeTab.id ? 'flex' : 'none' }]}
            >
              <WebView
                key={tab.reloadKey}
                ref={(ref) => {
                  webviewRefs.current[tab.id] = ref;
                }}
                source={{ uri: tab.url }}
                userAgent={tab.uaMode === 'desktop' ? DESKTOP_USER_AGENT : undefined}
                onNavigationStateChange={(nav) => handleNavigationStateChange(tab.id, nav)}
                onLoadProgress={(event) => handleLoadProgress(tab.id, event)}
                style={{ backgroundColor: colors.canvas }}
              />
            </View>
          ))}

        {!hasPage ? (
          <View style={[styles.blankState, { paddingHorizontal: screenMargin }]}>
            <Icon icon={Globe} size={iconSizes.lg} color={colors.inkPlaceholder} />
            <Text
              maxFontSizeMultiplier={maxFontScale}
              style={[typeScale.heading, { color: colors.ink, marginTop: spacing.sm }]}
            >
              New tab
            </Text>
            <Text
              maxFontSizeMultiplier={maxFontScale}
              style={[typeScale.body, { color: colors.inkSecondary, textAlign: 'center', marginTop: spacing.xxs }]}
            >
              Enter an address above to open a page.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof RefreshCw;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, spacing, typeScale, maxFontScale, minTouchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.controlButton,
        { minWidth: minTouchTarget, minHeight: minTouchTarget, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Icon icon={icon} size={iconSizes.md} color={colors.ink} />
      <Text
        maxFontSizeMultiplier={maxFontScale}
        numberOfLines={1}
        style={[typeScale.caption, { color: colors.inkSecondary, marginTop: spacing.xxs }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addressInput: {
    flex: 1,
  },
  goButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  controlsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewArea: {
    flex: 1,
  },
  blankState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

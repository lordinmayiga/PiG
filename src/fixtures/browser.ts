// Local state shape + fixture for BrowserScreen (SPEC.md §3.4, §9). No
// backend involved — tabs are pure client-side UI state, unlike the other
// screens' fixtures which stand in for future server data.

export type UserAgentMode = 'mobile' | 'desktop';

export interface BrowserTab {
  id: string;
  /** Page title once loaded, or a placeholder for a blank/unnavigated tab. */
  title: string;
  /** Committed URL the WebView is loaded at. Empty string = blank new-tab state. */
  url: string;
  /** Address-bar draft text — kept editable independent of the committed `url`. */
  addressDraft: string;
  uaMode: UserAgentMode;
  /** Bumped to force-remount the WebView (used by hard refresh / clear storage). */
  reloadKey: number;
}

let tabCounter = 0;
export function createBlankTab(): BrowserTab {
  tabCounter += 1;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: 'New tab',
    url: '',
    addressDraft: '',
    uaMode: 'mobile',
    reloadKey: 0,
  };
}

/** Common desktop Chrome UA string, used when a tab's `uaMode` is 'desktop'. */
export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

import type { OpenRouterSettings, VpsConnection } from '../types';

// Fixture data for Phase 4 screen builds — no real backend yet. Mocks a
// connected VPS pairing and a saved OpenRouter key. Real data arrives in
// the same shapes once Phase 6 wires the actual backend.
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

export const mockVpsConnection: VpsConnection = {
  host: 'pig.example-vps.net',
  paired: true,
  lastConnectedAt: hoursAgo(0.02),
};

export const mockUnpairedVpsConnection: VpsConnection = {
  host: 'pig.example-vps.net',
  paired: false,
};

export const mockOpenRouterSettings: OpenRouterSettings = {
  hasKey: true,
  keySuffix: '7f2a',
};

export const mockOpenRouterSettingsNoKey: OpenRouterSettings = {
  hasKey: false,
};

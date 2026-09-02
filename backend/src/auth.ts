/**
 * Pairing + bridge token module (BACKEND_SETUP_PLAN.md §1/§6).
 *
 * Two distinct kinds of token exist here:
 *
 * - **Pairing token**: one-time, short-TTL (10 min). Minted by `pig-bridge
 *   pair` (bin/pig-bridge.ts) and shown to the user as a QR code / plain
 *   text during the app's Setup screen scan flow. It is consumed exactly
 *   once, by the very first `hello` envelope the app sends after scanning.
 *   Once consumed it is deleted and can never be used again.
 *
 * - **Bridge token**: long-lived, minted automatically the moment a pairing
 *   token is successfully consumed. The app stores this in
 *   `src/secureStorage.ts` (device keychain/Keystore) and sends it on every
 *   subsequent `hello` — including reconnects — instead of ever re-running
 *   the pairing flow. It currently has no expiry or rotation; that's a
 *   deliberate scope cut for this phase (see `issueBridgeToken` below) and
 *   should be revisited before this ships beyond a single trusted device.
 *
 * Bridge tokens are in-memory only in the running server process — there's
 * exactly one server process, so a Set is sufficient and a restart just
 * means every paired device has to re-pair (an accepted scope cut for now).
 *
 * Pairing tokens are different: `pig-bridge pair` (bin/pig-bridge.ts) runs
 * as its own short-lived CLI process, separate from the long-running
 * server process that later has to verify the token a scanned QR carries.
 * An in-memory Map can't cross that process boundary, so the single
 * currently-pending pairing token is persisted to a small JSON file
 * (`.pairing-token.json`, gitignored, same directory as this module) that
 * both processes read/write. This is safe because there's only ever at
 * most one pending pairing token at a time (see `getPendingPairingInfo`'s
 * comment) and both processes run on the same VPS filesystem.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes, per plan §1

interface PendingPairing {
  token: string;
  expiresAt: number;
}

const PAIRING_STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.pairing-token.json');

function readPendingFromDisk(): PendingPairing | null {
  try {
    if (!existsSync(PAIRING_STATE_FILE)) return null;
    const raw = readFileSync(PAIRING_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PendingPairing;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    // Missing/corrupt/racing-write file — treat as "no pending token".
    return null;
  }
}

function writePendingToDisk(pending: PendingPairing | null): void {
  try {
    if (pending === null) {
      if (existsSync(PAIRING_STATE_FILE)) unlinkSync(PAIRING_STATE_FILE);
    } else {
      writeFileSync(PAIRING_STATE_FILE, JSON.stringify(pending), { mode: 0o600 });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth] failed to persist pairing token state:', err);
  }
}

/** Set of currently valid, long-lived bridge tokens. */
const validBridgeTokens = new Set<string>();

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Mints a fresh one-time pairing token with a 10-minute TTL and registers it
 * as pending.
 *
 * Judgment call: this always mints a *new* token rather than returning an
 * existing pending one. `pig-bridge pair` is a deliberate, explicit action
 * (a human running a CLI command), not something called repeatedly in a
 * hot loop — so minting fresh each time is simpler and avoids ever handing
 * out a token that's already partway through its TTL. `getPendingPairingInfo`
 * is provided separately for a caller that specifically wants to observe
 * (not create) pending pairing state.
 */
export function mintPairingToken(): { token: string; expiresAt: number } {
  const token = generateToken();
  const expiresAt = Date.now() + PAIRING_TOKEN_TTL_MS;
  writePendingToDisk({ token, expiresAt });
  return { token, expiresAt };
}

/**
 * Generates and registers a new long-lived bridge token, returning it.
 *
 * Exported for testability (per task spec) even though it's only otherwise
 * called internally by `verifyAndConsumePairingToken`.
 *
 * Future hardening: bridge tokens currently never expire and are never
 * rotated. Revisit once there's a real threat model for a lost/stolen
 * phone (e.g. per-device tokens with revocation, or periodic rotation on
 * reconnect).
 */
export function issueBridgeToken(): string {
  const token = generateToken();
  validBridgeTokens.add(token);
  return token;
}

/**
 * Validates a pairing token against the pending set. If it's present and
 * not expired, consumes it (single-use: removed immediately) and mints a
 * bridge token in its place. Returns `false` for anything invalid, expired,
 * or already consumed — callers shouldn't distinguish those cases to the
 * client (avoids leaking timing/existence info beyond "pairing failed").
 */
export function verifyAndConsumePairingToken(token: string): boolean {
  const pending = readPendingFromDisk();
  if (pending === null || pending.token !== token) return false;

  // Single-use: remove regardless of expiry outcome so a retried/expired
  // token can never be consumed twice.
  writePendingToDisk(null);

  if (Date.now() > pending.expiresAt) return false;

  issueBridgeToken();
  return true;
}

/** Checks whether `token` is a currently valid bridge token. */
export function isValidBridgeToken(token: string): boolean {
  return validBridgeTokens.has(token);
}

/**
 * Returns the currently pending pairing token, if one exists and hasn't
 * expired yet. Returns `null` otherwise (including if it was already
 * consumed). Provided for callers that want to observe pending state
 * without minting a new token — see the judgment-call note on
 * `mintPairingToken`.
 */
export function getPendingPairingInfo(): PendingPairing | null {
  // Only meaningful if exactly one pairing is ever pending at a time, which
  // matches how `pig-bridge pair` is used (a human running one CLI command).
  const pending = readPendingFromDisk();
  if (pending !== null && Date.now() <= pending.expiresAt) return pending;
  return null;
}

function sweepExpiredPairingTokens(): void {
  const pending = readPendingFromDisk();
  if (pending !== null && Date.now() > pending.expiresAt) {
    writePendingToDisk(null);
  }
}

const sweepInterval = setInterval(sweepExpiredPairingTokens, 60 * 1000);
// Don't let this timer keep the process alive on its own.
sweepInterval.unref?.();

/** Stops the periodic pending-token sweep. Call on clean shutdown/in tests. */
export function stopAuthSweep(): void {
  clearInterval(sweepInterval);
}

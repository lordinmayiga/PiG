#!/usr/bin/env -S npx tsx
/**
 * `pig-bridge` CLI (BACKEND_SETUP_PLAN.md §1/§6).
 *
 * Subcommands:
 *   pig-bridge pair   Mint a one-time pairing token and print it as a QR
 *                      code (plus a plain-text fallback) for the app's
 *                      Setup screen to scan.
 */

import qrcode from 'qrcode';

import { mintPairingToken } from '../src/auth.js';

const DEFAULT_PORT = 8787;

// This VPS's known public IP (BACKEND_SETUP_PLAN.md: hostname srv1924008).
// Used only as a last-resort fallback — prefer PIG_BRIDGE_HOST when set,
// since public-IP autodetection has no fully reliable stdlib-only method
// (it would need an outbound call to a third-party "what's my IP" service).
const FALLBACK_HOST_IP = '147.79.101.172';

function resolveHost(): string {
  const port = process.env.PIG_BRIDGE_PORT?.trim() || String(DEFAULT_PORT);
  const hostOverride = process.env.PIG_BRIDGE_HOST?.trim();
  const ip = hostOverride || FALLBACK_HOST_IP;
  return `${ip}:${port}`;
}

async function runPair(): Promise<void> {
  const { token, expiresAt } = mintPairingToken();
  const host = resolveHost();

  // Payload shape matches what the app's Setup screen scan flow expects:
  // a flat { host, token } object where `host` is "ip:port" as a single
  // string (see src/screens/setup/ConnectStep.tsx's manual-entry fields
  // and MOCK_SCANNED_HOST/MOCK_SCANNED_TOKEN, and src/secureStorage.ts's
  // BridgeCredentials shape, which both this payload and the saved
  // credentials share field-for-field).
  const payload = JSON.stringify({ host, token });

  const qr = await qrcode.toString(payload, { type: 'terminal' });
  process.stdout.write(`${qr}\n`);

  const expiresIn = Math.round((expiresAt - Date.now()) / 1000);
  process.stdout.write('Scan this QR code with the PiG app, or enter these manually:\n\n');
  process.stdout.write(`  Host:  ${host}\n`);
  process.stdout.write(`  Token: ${token}\n\n`);
  process.stdout.write(
    `Expires: ${new Date(expiresAt).toISOString()} (in ~${expiresIn}s)\n`
  );
}

function printUsage(): void {
  process.stderr.write('Usage: pig-bridge pair\n');
  process.stderr.write('  pair   Mint a pairing token and print it as a QR code + plain text.\n');
}

async function main(): Promise<void> {
  const [, , subcommand] = process.argv;

  if (subcommand === 'pair') {
    await runPair();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`pig-bridge: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

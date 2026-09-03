import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isValidBridgeToken, mintPairingToken, verifyAndConsumePairingToken } from '../src/auth.js';
import { executeNonDestructiveAction } from '../src/actions.js';
import { listDirectory, readFileContent, resolveSafePath } from '../src/files.js';
import { saveOpenRouterKey, getOpenRouterKeySettings, getSavedOpenRouterKey } from '../src/openrouterConfig.js';
import { routeInput, classify } from '../src/routeInput.js';

const execFileAsync = promisify(execFile);

test('Auth: Backdoor token removed & pairing token consumption works', () => {
  // 1. Backdoor token 'a1b2c3d4e5f6' must be rejected
  assert.equal(isValidBridgeToken('a1b2c3d4e5f6'), false, 'Hardcoded backdoor token must not be valid');

  // 2. Fresh pairing token should not be a valid bridge token before consumption
  const { token } = mintPairingToken();
  assert.equal(isValidBridgeToken(token), false, 'Unconsumed pairing token must not be in validBridgeTokens');

  // 3. Consuming pairing token succeeds and adds it to validBridgeTokens
  const consumed = verifyAndConsumePairingToken(token);
  assert.equal(consumed, true, 'verifyAndConsumePairingToken should succeed');
  assert.equal(isValidBridgeToken(token), true, 'Consumed token must become valid bridge token');

  // 4. Cannot consume twice
  assert.equal(verifyAndConsumePairingToken(token), false, 'Pairing token is single-use');
});

test('Actions: rename_session executes tmux rename-session', async () => {
  const origName = `test_orig_${Date.now()}`;
  const newName = `test_renamed_${Date.now()}`;

  // Create temporary tmux session
  await execFileAsync('tmux', ['new-session', '-d', '-s', origName]);

  try {
    const result = await executeNonDestructiveAction('rename_session', origName, { newName });
    assert.equal(result.kind, 'action_executed');
    assert.ok(result.summary?.includes(origName) && result.summary?.includes(newName));

    // Verify session was actually renamed in tmux
    const { stdout } = await execFileAsync('tmux', ['list-sessions', '-F', '#{session_name}']);
    const sessions = stdout.split('\n');
    assert.ok(sessions.includes(newName), `Session list must include new name "${newName}"`);
    assert.ok(!sessions.includes(origName), `Session list must not include old name "${origName}"`);
  } finally {
    try {
      await execFileAsync('tmux', ['kill-session', '-t', newName]);
    } catch {}
    try {
      await execFileAsync('tmux', ['kill-session', '-t', origName]);
    } catch {}
  }
});

test('Files: listDirectory and readFileContent', async () => {
  // Safe path resolution
  const resolvedRoot = resolveSafePath();
  assert.ok(resolvedRoot.startsWith('/root'), 'Default safe path starts with /root');

  // List current projects directory
  const listRes = await listDirectory('/root/projects/PiG');
  assert.equal(listRes.error, undefined);
  assert.ok(listRes.entries.length > 0, 'Directory should contain entries');
  const pkgEntry = listRes.entries.find((e) => e.name === 'package.json');
  assert.ok(pkgEntry, 'Must find package.json in listing');
  assert.equal(pkgEntry.type, 'file');
  assert.equal(pkgEntry.mimeType, 'application/json');
  assert.ok(typeof pkgEntry.sizeBytes === 'number' && pkgEntry.sizeBytes > 0);

  // List nonexistent directory handles error gracefully
  const missingRes = await listDirectory('/nonexistent_directory_test_123');
  assert.ok(missingRes.error, 'Must report error for nonexistent directory');
  assert.equal(missingRes.entries.length, 0);

  // Read file content
  const readRes = await readFileContent('/root/projects/PiG/package.json');
  assert.equal(readRes.error, undefined);
  assert.ok(readRes.content?.includes('"name"'));

  // Read nonexistent file handles error gracefully
  const readMissing = await readFileContent('/root/projects/PiG/nonexistent_file_test_123.txt');
  assert.ok(readMissing.error, 'Must report error for nonexistent file');
  assert.equal(readMissing.content, undefined);
});

test('OpenRouter Config: Save, get settings, and persistence', () => {
  const testKey = 'sk-or-v1-testkey9876543210abcdef';
  const saveRes = saveOpenRouterKey(testKey);
  assert.equal(saveRes.ok, true);
  assert.equal(saveRes.keySuffix, 'cdef');

  const settings = getOpenRouterKeySettings();
  assert.equal(settings.hasKey, true);
  assert.equal(settings.keySuffix, 'cdef');

  const loadedKey = getSavedOpenRouterKey();
  assert.equal(loadedKey, testKey);

  // Rejects empty key
  const badSave = saveOpenRouterKey('');
  assert.equal(badSave.ok, false);
});

test('RouteInput: local classification and fallback', async () => {
  // Local classify
  const killRes = classify('kill session sess-1');
  assert.equal(killRes.kind, 'action');
  if (killRes.kind === 'action') {
    assert.equal(killRes.action.type, 'kill_session');
    assert.equal(killRes.requiresConfirm, true);
  }

  const renameRes = classify('rename session to new-backend');
  assert.equal(renameRes.kind, 'action');
  if (renameRes.kind === 'action') {
    assert.equal(renameRes.action.type, 'rename_session');
    assert.equal(renameRes.action.params?.newName, 'new-backend');
  }

  const promptRes = classify('Can you write a sorting algorithm in python?');
  assert.equal(promptRes.kind, 'prompt');
  if (promptRes.kind === 'prompt') {
    assert.equal(promptRes.cleanedText, 'Can you write a sorting algorithm in python?');
  }

  // routeInput without OpenRouter (or fallback)
  const routed = await routeInput(
    { sessionId: 'sess-1', text: 'Can you write a sorting algorithm in python?' },
    'req-1',
  );
  assert.equal(routed.kind, 'prompt_routed');
  assert.equal(routed.cleanedPrompt, 'Can you write a sorting algorithm in python?');
});

import { WebSocket } from 'ws';
import type {
  Envelope,
  HelloPayload,
  FsListPayload,
  FsListResultPayload,
  FsReadPayload,
  FsReadResultPayload,
  SetOpenRouterKeyPayload,
  SetOpenRouterKeyAckPayload,
  GetOpenRouterKeyPayload,
  GetOpenRouterKeyAckPayload,
} from '../../src/types/index.js';

const WS_URL = 'ws://127.0.0.1:8787';

function waitForMsg<T = unknown>(ws: WebSocket, expectedType: string, timeoutMs = 5000): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), timeoutMs);
    const handler = (data: unknown) => {
      try {
        const parsed = JSON.parse(String(data)) as Envelope<T>;
        if (parsed.type === expectedType) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch (err) {
        clearTimeout(timer);
        ws.off('message', handler);
        reject(err);
      }
    };
    ws.on('message', handler);
  });
}

test('WebSocket Endpoints: fs_list, fs_read, set_openrouter_key, get_openrouter_key', async () => {
  // 1. Verify backdoor token is rejected over websocket
  const badWs = new WebSocket(WS_URL);
  await new Promise((resolve) => badWs.once('open', resolve));
  badWs.send(
    JSON.stringify({
      v: 1,
      type: 'hello',
      id: 'test-bad-backdoor',
      ts: Date.now(),
      payload: { token: 'a1b2c3d4e5f6' },
    }),
  );
  const errRes = await waitForMsg(badWs, 'error');
  assert.equal(errRes.payload && (errRes.payload as { code: string }).code, 'bad_token');
  badWs.close();

  // 2. Authenticate with real pairing token
  const { token } = mintPairingToken();
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve) => ws.once('open', resolve));

  ws.send(
    JSON.stringify({
      v: 1,
      type: 'hello',
      id: 'test-auth-hello',
      ts: Date.now(),
      payload: { token },
    }),
  );
  const helloAck = await waitForMsg(ws, 'hello_ack');
  assert.equal((helloAck.payload as { ok: boolean }).ok, true);

  // 3. Test fs_list envelope
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'fs_list',
      id: 'test-fs-list-1',
      ts: Date.now(),
      payload: { path: '/root/projects/PiG' },
    }),
  );
  const fsListRes = await waitForMsg<FsListResultPayload>(ws, 'fs_list_result');
  assert.equal(fsListRes.payload.path, '/root/projects/PiG');
  assert.ok(Array.isArray(fsListRes.payload.entries));
  assert.ok(fsListRes.payload.entries.some((e) => e.name === 'package.json'));

  // 4. Test fs_read envelope
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'fs_read',
      id: 'test-fs-read-1',
      ts: Date.now(),
      payload: { path: '/root/projects/PiG/package.json' },
    }),
  );
  const fsReadRes = await waitForMsg<FsReadResultPayload>(ws, 'fs_read_result');
  assert.ok(fsReadRes.payload.content?.includes('"name"'));

  // 5. Test set_openrouter_key envelope
  const testKey = 'sk-or-v1-ws-test-abcdef123456';
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'set_openrouter_key',
      id: 'test-set-key-1',
      ts: Date.now(),
      payload: { apiKey: testKey },
    }),
  );
  const setKeyAck = await waitForMsg<SetOpenRouterKeyAckPayload>(ws, 'set_openrouter_key_ack');
  assert.equal(setKeyAck.payload.ok, true);
  assert.equal(setKeyAck.payload.keySuffix, '3456');

  // 6. Test get_openrouter_key envelope
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'get_openrouter_key',
      id: 'test-get-key-1',
      ts: Date.now(),
      payload: {},
    }),
  );
  const getKeyAck = await waitForMsg<GetOpenRouterKeyAckPayload>(ws, 'get_openrouter_key_ack');
  assert.equal(getKeyAck.payload.hasKey, true);
  assert.equal(getKeyAck.payload.keySuffix, '3456');

  ws.close();
});

import type { FileNode } from '../types';

// Fixture data for Phase 4 screen builds — a mock file tree for a session's
// working folder, browsed by FileExplorerScreen. Flat list keyed by `path`
// (relative to the working-folder root); a node's parent directory is
// everything before its last "/" segment, so the screen derives folder
// contents by filtering on that prefix rather than walking a nested tree.
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

export const mockFileTree: FileNode[] = [
  { name: 'src', type: 'folder', path: 'src', modifiedAt: hoursAgo(2) },
  { name: 'index.ts', type: 'file', path: 'src/index.ts', sizeBytes: 412, mimeType: 'text/typescript', modifiedAt: hoursAgo(2) },
  { name: 'App.tsx', type: 'file', path: 'src/App.tsx', sizeBytes: 1180, mimeType: 'text/typescript', modifiedAt: hoursAgo(3) },
  { name: 'components', type: 'folder', path: 'src/components', modifiedAt: hoursAgo(5) },
  { name: 'Button.tsx', type: 'file', path: 'src/components/Button.tsx', sizeBytes: 640, mimeType: 'text/typescript', modifiedAt: hoursAgo(5) },
  { name: 'assets', type: 'folder', path: 'assets', modifiedAt: hoursAgo(20) },
  { name: 'logo.png', type: 'file', path: 'assets/logo.png', sizeBytes: 48_302, mimeType: 'image/png', modifiedAt: hoursAgo(20) },
  { name: 'screenshot.png', type: 'file', path: 'assets/screenshot.png', sizeBytes: 812_004, mimeType: 'image/png', modifiedAt: hoursAgo(1) },
  { name: 'README.md', type: 'file', path: 'README.md', sizeBytes: 2048, mimeType: 'text/markdown', modifiedAt: hoursAgo(30) },
  { name: 'package.json', type: 'file', path: 'package.json', sizeBytes: 890, mimeType: 'application/json', modifiedAt: hoursAgo(30) },
  { name: 'notes.txt', type: 'file', path: 'notes.txt', sizeBytes: 156, mimeType: 'text/plain', modifiedAt: hoursAgo(0.5) },
  { name: 'coverage-report.pdf', type: 'file', path: 'coverage-report.pdf', sizeBytes: 233_512, mimeType: 'application/pdf', modifiedAt: hoursAgo(6) },
  { name: 'build-artifacts.zip', type: 'file', path: 'build-artifacts.zip', sizeBytes: 4_812_004, mimeType: 'application/zip', modifiedAt: hoursAgo(10) },
];

/** Text-file contents, keyed by `FileNode.path` — powers the monospace read-only viewer. */
export const mockFileContents: Record<string, string> = {
  'src/index.ts': `import { registerRootComponent } from 'expo';\nimport App from './App';\n\nregisterRootComponent(App);\n`,
  'src/App.tsx': `import { View, Text } from 'react-native';\n\nexport default function App() {\n  return (\n    <View style={{ flex: 1 }}>\n      <Text>Hello, PiG</Text>\n    </View>\n  );\n}\n`,
  'src/components/Button.tsx': `import { Pressable, Text } from 'react-native';\n\nexport function Button({ label, onPress }: { label: string; onPress: () => void }) {\n  return (\n    <Pressable onPress={onPress}>\n      <Text>{label}</Text>\n    </Pressable>\n  );\n}\n`,
  'README.md': `# PiG session workspace\n\nThis folder is the session's working directory on the VPS. The agent reads\nand writes files here directly.\n\n## Structure\n\n- \`src/\` — app source\n- \`assets/\` — images referenced by the app\n`,
  'package.json': `{\n  "name": "session-workspace",\n  "version": "1.0.0",\n  "private": true\n}\n`,
  'notes.txt': `TODO:\n- fix the flaky auth test\n- follow up on the tmux reconnect edge case\n`,
};

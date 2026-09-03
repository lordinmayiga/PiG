/**
 * Filesystem operations for PiG bridge (FAKE_DATA_ELIMINATION_PLAN.md Phase 3.5).
 *
 * Provides safe directory listing and file content reading for VPS filesystem.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type { FsEntry, FsListResultPayload, FsReadResultPayload } from '../../src/types/index.js';

const DEFAULT_ROOT_DIR = existsSync('/root/projects') ? '/root/projects' : (existsSync('/root') ? '/root' : homedir());

const MAX_READ_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for safety

const MIME_TYPES: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript-jsx',
  '.js': 'application/javascript',
  '.jsx': 'text/javascript-jsx',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/x-toml',
  '.xml': 'application/xml',
  '.log': 'text/plain',
  '.py': 'text/x-python',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.sql': 'text/x-sql',
  '.pdf': 'application/pdf',
};

/**
 * Resolves a given path safely, expanding ~ to homedir and resolving relative paths
 * against the standardized default root directory (/root/projects or /root).
 */
export function resolveSafePath(inputPath?: string): string {
  if (!inputPath || inputPath.trim() === '') {
    return DEFAULT_ROOT_DIR;
  }
  let trimmed = inputPath.trim();
  if (trimmed === '~') {
    return homedir();
  }
  if (trimmed.startsWith('~/')) {
    trimmed = join(homedir(), trimmed.slice(2));
  }
  if (!isAbsolute(trimmed)) {
    return resolve(DEFAULT_ROOT_DIR, trimmed);
  }
  return resolve(trimmed);
}

/**
 * Lists the entries of a directory on the VPS filesystem.
 */
export async function listDirectory(dirPath?: string): Promise<FsListResultPayload> {
  const targetPath = resolveSafePath(dirPath);

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      return {
        path: targetPath,
        entries: [],
        error: 'Path is not a directory',
      };
    }

    const dirents = await readdir(targetPath, { withFileTypes: true });
    const entries: FsEntry[] = [];

    for (const dirent of dirents) {
      const fullPath = join(targetPath, dirent.name);
      try {
        let isDir = dirent.isDirectory();
        let sizeBytes: number | undefined;

        if (dirent.isSymbolicLink()) {
          try {
            const linkStat = await stat(fullPath);
            isDir = linkStat.isDirectory();
            sizeBytes = isDir ? undefined : linkStat.size;
          } catch {
            // Broken symlink: treat as regular file without size
            isDir = false;
          }
        } else if (!isDir) {
          try {
            const fileStat = await stat(fullPath);
            sizeBytes = fileStat.size;
          } catch {
            // Stat failed on individual file
          }
        }

        const ext = extname(dirent.name).toLowerCase();
        const mimeType = isDir ? undefined : (MIME_TYPES[ext] ?? 'application/octet-stream');

        entries.push({
          name: dirent.name,
          path: fullPath,
          type: isDir ? 'folder' : 'file',
          ...(sizeBytes !== undefined ? { sizeBytes } : {}),
          ...(mimeType ? { mimeType } : {}),
        });
      } catch {
        // Individual entry failed, continue to other entries
      }
    }

    // Sort: folders first alphabetically, then files alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return {
      path: targetPath,
      entries,
    };
  } catch (err) {
    return {
      path: targetPath,
      entries: [],
      error: (err as Error).message,
    };
  }
}

/**
 * Reads the content of a file from the VPS filesystem.
 */
export async function readFileContent(filePath: string): Promise<FsReadResultPayload> {
  if (!filePath || filePath.trim() === '') {
    return {
      path: '',
      error: 'File path cannot be empty',
    };
  }

  const targetPath = resolveSafePath(filePath);

  try {
    const stats = await stat(targetPath);
    if (stats.isDirectory()) {
      return {
        path: targetPath,
        error: 'Path is a directory, not a file',
      };
    }

    if (stats.size > MAX_READ_SIZE_BYTES) {
      return {
        path: targetPath,
        error: `File size (${stats.size} bytes) exceeds maximum limit of 5MB`,
      };
    }

    const content = await readFile(targetPath, 'utf8');
    return {
      path: targetPath,
      content,
    };
  } catch (err) {
    return {
      path: targetPath,
      error: (err as Error).message,
    };
  }
}

import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const IGNORED_NAMES = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__']);

function sanitizePath(inputPath = '') {
  const normalized = path
    .normalize(String(inputPath).replace(/\\/g, '/'))
    .replace(/^([/])+/, '');

  if (normalized === '.' || normalized === '') {
    return '';
  }

  if (normalized.startsWith('..')) {
    throw new Error('Invalid path traversal attempt');
  }

  return normalized;
}

export function resolveWorkspacePath(relativePath = '') {
  const sanitized = sanitizePath(relativePath);
  const targetPath = path.resolve(config.workspaceRoot, sanitized);

  if (targetPath !== config.workspaceRoot && !targetPath.startsWith(`${config.workspaceRoot}${path.sep}`)) {
    throw new Error('Resolved path escapes workspace root');
  }

  return targetPath;
}

function sortEntries(entries) {
  return [...entries].sort((entryA, entryB) => {
    const entryAIsDirectory = entryA.isDirectory();
    const entryBIsDirectory = entryB.isDirectory();

    if (entryAIsDirectory && !entryBIsDirectory) {
      return -1;
    }

    if (!entryAIsDirectory && entryBIsDirectory) {
      return 1;
    }

    return entryA.name.localeCompare(entryB.name);
  });
}

async function buildNode(absolutePath, relativePath) {
  const stat = await fs.stat(absolutePath);
  const name = relativePath ? path.basename(relativePath) : path.basename(config.workspaceRoot);

  if (!stat.isDirectory()) {
    return {
      name,
      path: relativePath,
      kind: 'file',
      children: [],
    };
  }

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const children = [];

  for (const entry of sortEntries(entries)) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }

    const nextAbsolutePath = path.join(absolutePath, entry.name);
    const nextRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    children.push(await buildNode(nextAbsolutePath, nextRelativePath));
  }

  return {
    name,
    path: relativePath,
    kind: 'folder',
    children,
  };
}

export async function getWorkspaceTree(relativePath = '') {
  const sanitized = sanitizePath(relativePath);
  const absolutePath = resolveWorkspacePath(sanitized);

  return buildNode(absolutePath, sanitized);
}

export async function readWorkspaceFile(relativePath) {
  const sanitized = sanitizePath(relativePath);
  if (!sanitized) {
    throw new Error('File path is required');
  }

  const absolutePath = resolveWorkspacePath(sanitized);
  const content = await fs.readFile(absolutePath, 'utf-8');

  return {
    path: sanitized,
    content,
  };
}

export async function writeWorkspaceFile(relativePath, content = '') {
  const sanitized = sanitizePath(relativePath);
  if (!sanitized) {
    throw new Error('File path is required');
  }

  const absolutePath = resolveWorkspacePath(sanitized);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');

  return { path: sanitized };
}

export async function createWorkspaceFile(relativePath) {
  return writeWorkspaceFile(relativePath, '');
}

export async function createWorkspaceFolder(relativePath) {
  const sanitized = sanitizePath(relativePath);
  if (!sanitized) {
    throw new Error('Folder path is required');
  }

  const absolutePath = resolveWorkspacePath(sanitized);
  await fs.mkdir(absolutePath, { recursive: true });

  return { path: sanitized };
}

export async function renameWorkspacePath(oldPath, newPath) {
  const sanitizedOldPath = sanitizePath(oldPath);
  const sanitizedNewPath = sanitizePath(newPath);

  if (!sanitizedOldPath || !sanitizedNewPath) {
    throw new Error('Both oldPath and newPath are required');
  }

  const oldAbsolutePath = resolveWorkspacePath(sanitizedOldPath);
  const newAbsolutePath = resolveWorkspacePath(sanitizedNewPath);

  await fs.mkdir(path.dirname(newAbsolutePath), { recursive: true });
  await fs.rename(oldAbsolutePath, newAbsolutePath);

  return {
    oldPath: sanitizedOldPath,
    newPath: sanitizedNewPath,
  };
}

export async function deleteWorkspacePath(relativePath) {
  const sanitized = sanitizePath(relativePath);

  if (!sanitized) {
    throw new Error('Path is required');
  }

  const absolutePath = resolveWorkspacePath(sanitized);
  await fs.rm(absolutePath, { recursive: true, force: false });

  return { path: sanitized };
}

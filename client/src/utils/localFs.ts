import type { FileNode } from '../types';

const DB_NAME = 'collabrix_fs';
const STORE_NAME = 'handles';
const ROOT_KEY = 'root-directory';

type GenericHandle = any;

function normalizePath(targetPath: string): string {
  const clean = targetPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!clean || clean === '.') {
    return '';
  }

  const parts = clean.split('/').filter(Boolean);
  if (parts.some((part) => part === '..')) {
    throw new Error('Invalid relative path');
  }

  return parts.join('/');
}

function splitSegments(targetPath: string): string[] {
  const normalized = normalizePath(targetPath);
  return normalized ? normalized.split('/') : [];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export async function ensureHandlePermission(handle: GenericHandle): Promise<boolean> {
  if (!handle?.queryPermission || !handle?.requestPermission) {
    return false;
  }

  const readWriteOptions = { mode: 'readwrite' };
  const existingPermission = await handle.queryPermission(readWriteOptions);
  if (existingPermission === 'granted') {
    return true;
  }

  const requestedPermission = await handle.requestPermission(readWriteOptions);
  return requestedPermission === 'granted';
}

export async function saveDirectoryHandle(handle: GenericHandle): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(handle, ROOT_KEY);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Failed to save directory handle'));
  });
}

export async function loadPersistedDirectoryHandle(): Promise<GenericHandle | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ROOT_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Failed to load directory handle'));
  });
}

export async function pickDirectory(): Promise<GenericHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('window.showDirectoryPicker is not supported in this browser');
  }

  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  const granted = await ensureHandlePermission(handle);

  if (!granted) {
    throw new Error('Read/write permission denied for selected directory');
  }

  await saveDirectoryHandle(handle);
  return handle;
}

async function getDirectoryHandleBySegments(
  rootHandle: GenericHandle,
  segments: string[],
  create = false,
): Promise<GenericHandle> {
  let currentHandle = rootHandle;

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create });
  }

  return currentHandle;
}

async function getParentDirectoryAndName(
  rootHandle: GenericHandle,
  targetPath: string,
  createParent = false,
): Promise<{ parentHandle: GenericHandle; entryName: string }> {
  const segments = splitSegments(targetPath);
  if (segments.length === 0) {
    throw new Error('A target path is required');
  }

  const entryName = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const parentHandle = await getDirectoryHandleBySegments(rootHandle, parentSegments, createParent);

  return { parentHandle, entryName };
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((nodeA, nodeB) => {
    if (nodeA.kind === 'folder' && nodeB.kind === 'file') {
      return -1;
    }

    if (nodeA.kind === 'file' && nodeB.kind === 'folder') {
      return 1;
    }

    return nodeA.name.localeCompare(nodeB.name);
  });
}

async function readDirectoryTree(handle: GenericHandle, currentPath = ''): Promise<FileNode[]> {
  const children: FileNode[] = [];

  for await (const [entryName, entryHandle] of handle.entries()) {
    const childPath = currentPath ? `${currentPath}/${entryName}` : entryName;

    if (entryHandle.kind === 'directory') {
      const nestedChildren = await readDirectoryTree(entryHandle, childPath);
      children.push({
        name: entryName,
        path: childPath,
        kind: 'folder',
        handle: entryHandle,
        children: nestedChildren,
      });
    } else {
      children.push({
        name: entryName,
        path: childPath,
        kind: 'file',
        handle: entryHandle,
        children: [],
      });
    }
  }

  return sortNodes(children);
}

export async function buildTreeFromDirectoryHandle(rootHandle: GenericHandle): Promise<FileNode> {
  return {
    name: rootHandle.name,
    path: '',
    kind: 'folder',
    handle: rootHandle,
    children: await readDirectoryTree(rootHandle),
  };
}

export async function readLocalFileHandle(fileHandle: GenericHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

export async function readLocalFile(rootHandle: GenericHandle, targetPath: string): Promise<string> {
  const { parentHandle, entryName } = await getParentDirectoryAndName(rootHandle, targetPath, false);
  const fileHandle = await parentHandle.getFileHandle(entryName, { create: false });
  return readLocalFileHandle(fileHandle);
}

export async function writeLocalFile(
  rootHandle: GenericHandle,
  targetPath: string,
  content: string,
): Promise<void> {
  const { parentHandle, entryName } = await getParentDirectoryAndName(rootHandle, targetPath, true);
  const fileHandle = await parentHandle.getFileHandle(entryName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function createLocalFile(rootHandle: GenericHandle, targetPath: string): Promise<void> {
  const { parentHandle, entryName } = await getParentDirectoryAndName(rootHandle, targetPath, true);
  await parentHandle.getFileHandle(entryName, { create: true });
}

export async function createLocalFolder(rootHandle: GenericHandle, targetPath: string): Promise<void> {
  const segments = splitSegments(targetPath);
  if (segments.length === 0) {
    throw new Error('Folder path is required');
  }

  await getDirectoryHandleBySegments(rootHandle, segments, true);
}

async function copyFileHandle(sourceFileHandle: GenericHandle, destinationDirectoryHandle: GenericHandle, fileName: string) {
  const sourceFile = await sourceFileHandle.getFile();
  const fileContent = await sourceFile.text();

  const destinationFileHandle = await destinationDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await destinationFileHandle.createWritable();
  await writable.write(fileContent);
  await writable.close();
}

async function copyDirectoryRecursively(sourceDirectoryHandle: GenericHandle, destinationDirectoryHandle: GenericHandle) {
  for await (const [entryName, entryHandle] of sourceDirectoryHandle.entries()) {
    if (entryHandle.kind === 'directory') {
      const nextDestinationDirectory = await destinationDirectoryHandle.getDirectoryHandle(entryName, {
        create: true,
      });
      await copyDirectoryRecursively(entryHandle, nextDestinationDirectory);
      continue;
    }

    await copyFileHandle(entryHandle, destinationDirectoryHandle, entryName);
  }
}

export async function renameLocalPath(
  rootHandle: GenericHandle,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const oldInfo = await getParentDirectoryAndName(rootHandle, oldPath, false);

  try {
    const oldFileHandle = await oldInfo.parentHandle.getFileHandle(oldInfo.entryName, { create: false });
    const file = await oldFileHandle.getFile();
    const content = await file.text();

    await writeLocalFile(rootHandle, newPath, content);
    await oldInfo.parentHandle.removeEntry(oldInfo.entryName);
    return;
  } catch {
    const oldDirectoryHandle = await oldInfo.parentHandle.getDirectoryHandle(oldInfo.entryName, {
      create: false,
    });

    const newSegments = splitSegments(newPath);
    if (newSegments.length === 0) {
      throw new Error('newPath is required');
    }

    const newFolderName = newSegments[newSegments.length - 1];
    const newParentHandle = await getDirectoryHandleBySegments(rootHandle, newSegments.slice(0, -1), true);
    const newFolderHandle = await newParentHandle.getDirectoryHandle(newFolderName, { create: true });

    await copyDirectoryRecursively(oldDirectoryHandle, newFolderHandle);
    await oldInfo.parentHandle.removeEntry(oldInfo.entryName, { recursive: true });
  }
}

export async function deleteLocalPath(rootHandle: GenericHandle, targetPath: string): Promise<void> {
  const { parentHandle, entryName } = await getParentDirectoryAndName(rootHandle, targetPath, false);
  await parentHandle.removeEntry(entryName, { recursive: true });
}

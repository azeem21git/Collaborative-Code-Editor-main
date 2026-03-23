import axios from 'axios';
import type { AiFixResponse, FsTreeResponse, RemoteFileResponse } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

export async function fetchRemoteTree(path = ''): Promise<FsTreeResponse> {
  const response = await api.get('/fs/tree', { params: { path } });
  return response.data;
}

export async function readRemoteFile(path: string): Promise<RemoteFileResponse> {
  const response = await api.get('/fs/file', { params: { path } });
  return response.data;
}

export async function writeRemoteFile(path: string, content: string, roomId?: string): Promise<void> {
  await api.put('/fs/file', { path, content, roomId });
}

export async function createRemoteFile(path: string, roomId?: string): Promise<void> {
  await api.post('/fs/file', { path, roomId });
}

export async function createRemoteFolder(path: string, roomId?: string): Promise<void> {
  await api.post('/fs/folder', { path, roomId });
}

export async function renameRemotePath(oldPath: string, newPath: string, roomId?: string): Promise<void> {
  await api.patch('/fs/rename', { oldPath, newPath, roomId });
}

export async function deleteRemotePath(path: string, roomId?: string): Promise<void> {
  await api.delete('/fs/path', { params: { path, roomId } });
}

export async function requestAiFix(code: string, language: string): Promise<AiFixResponse> {
  const response = await api.post('/ai/fix-code', {
    code,
    language,
  });

  return response.data;
}

export async function processVision(payload: {
  imageBase64?: string;
  coordinates?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await api.post('/ai/vision/process', payload);
  return response.data;
}

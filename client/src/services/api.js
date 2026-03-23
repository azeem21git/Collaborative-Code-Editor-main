import axios from 'axios';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const api = axios.create({
    baseURL: apiBaseUrl,
    timeout: 30000,
});
export async function fetchRemoteTree(path = '') {
    const response = await api.get('/fs/tree', { params: { path } });
    return response.data;
}
export async function readRemoteFile(path) {
    const response = await api.get('/fs/file', { params: { path } });
    return response.data;
}
export async function writeRemoteFile(path, content, roomId) {
    await api.put('/fs/file', { path, content, roomId });
}
export async function createRemoteFile(path, roomId) {
    await api.post('/fs/file', { path, roomId });
}
export async function createRemoteFolder(path, roomId) {
    await api.post('/fs/folder', { path, roomId });
}
export async function renameRemotePath(oldPath, newPath, roomId) {
    await api.patch('/fs/rename', { oldPath, newPath, roomId });
}
export async function deleteRemotePath(path, roomId) {
    await api.delete('/fs/path', { params: { path, roomId } });
}
export async function requestAiFix(code, language) {
    const response = await api.post('/ai/fix-code', {
        code,
        language,
    });
    return response.data;
}
export async function processVision(payload) {
    const response = await api.post('/ai/vision/process', payload);
    return response.data;
}

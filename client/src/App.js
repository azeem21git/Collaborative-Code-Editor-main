import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, FolderOpen, FolderPlus, HardDrive, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import DiffView from './components/DiffView';
import Editor from './components/Editor';
import EditorTabs from './components/EditorTabs';
import ExplorerContextMenu from './components/ExplorerContextMenu';
import FileTree from './components/FileTree';
import TerminalPanel from './components/TerminalPanel';
import { createRemoteFile, createRemoteFolder, deleteRemotePath, fetchRemoteTree, readRemoteFile, renameRemotePath, requestAiFix, writeRemoteFile, } from './services/api';
import { socket } from './services/socket';
import { buildTreeFromDirectoryHandle, createLocalFile, createLocalFolder, deleteLocalPath, ensureHandlePermission, loadPersistedDirectoryHandle, pickDirectory, readLocalFileHandle, readLocalFile, renameLocalPath, writeLocalFile, } from './utils/localFs';
const DEFAULT_ROOM = 'collabrix-room';
function getLanguageFromPath(path) {
    if (!path) {
        return 'plaintext';
    }
    const extension = path.split('.').pop()?.toLowerCase() || '';
    const languageByExtension = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        cpp: 'cpp',
        c: 'c',
        java: 'java',
        json: 'json',
        md: 'markdown',
        html: 'html',
        css: 'css',
    };
    return languageByExtension[extension] || extension || 'plaintext';
}
function nowLabel(message) {
    return `[${new Date().toLocaleTimeString()}] ${message}`;
}
function parentPath(path) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 1) {
        return '';
    }
    return segments.slice(0, -1).join('/');
}
function getFileNameFromPath(path) {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || path;
}
function buildDefaultSiblingPath(currentPath, fallbackName, currentKind = null) {
    if (!currentPath) {
        return fallbackName;
    }
    if (currentKind === 'folder') {
        return `${currentPath}/${fallbackName}`;
    }
    const base = parentPath(currentPath);
    return base ? `${base}/${fallbackName}` : fallbackName;
}
function App({ initialRoomId, initialUserName, onSessionChange }) {
    const [roomId, setRoomId] = useState(initialRoomId || DEFAULT_ROOM);
    const [userName] = useState(initialUserName || 'collabrix-user');
    const [treeRoot, setTreeRoot] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [openFiles, setOpenFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState(null);
    const [aiFixResult, setAiFixResult] = useState(null);
    const [isFixing, setIsFixing] = useState(false);
    const [isTreeLoading, setIsTreeLoading] = useState(false);
    const [isFileLoading, setIsFileLoading] = useState(false);
    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [terminalChunks, setTerminalChunks] = useState([]);
    const [selectedRunLanguage, setSelectedRunLanguage] = useState('python');
    const [isExecutionRunning, setIsExecutionRunning] = useState(false);
    const [roomUsers, setRoomUsers] = useState([]);
    const [remoteCursors, setRemoteCursors] = useState([]);
    const [explorerContextMenu, setExplorerContextMenu] = useState(null);
    const [syncStatus, setSyncStatus] = useState('synced');
    const socketRef = useRef(socket);
    const saveTimeoutRef = useRef(null);
    const codeSyncTimeoutRef = useRef(null);
    const cursorSyncTimeoutRef = useRef(null);
    const suppressAutosaveRef = useRef(false);
    const terminalChunkIdRef = useRef(0);
    const localCursorRef = useRef(null);
    const latestSyncSequenceRef = useRef(0);
    const activeSocket = socketRef.current;
    const activeFile = useMemo(() => openFiles.find((tab) => tab.id === activeFileId) ?? null, [openFiles, activeFileId]);
    const selectedFilePath = activeFile?.path ?? null;
    const editorCode = activeFile?.content ?? '';
    const activeFileRemoteCursors = useMemo(() => remoteCursors.filter((cursor) => cursor.filePath === selectedFilePath), [remoteCursors, selectedFilePath]);
    const visibleRoomUsers = useMemo(() => roomUsers.slice(0, 6), [roomUsers]);
    // Auto-detect run language whenever the active tab changes.
    useEffect(() => {
        if (!activeFile)
            return;
        const ext = activeFile.path.split('.').pop()?.toLowerCase() ?? '';
        const extToLanguage = {
            py: 'python',
            java: 'java',
            c: 'c',
            cpp: 'cpp',
            cc: 'cpp',
            cxx: 'cpp',
        };
        const detected = extToLanguage[ext];
        if (detected)
            setSelectedRunLanguage(detected);
    }, [activeFile?.path]);
    const appendTerminalChunk = useCallback((text, stream = 'stdout') => {
        setTerminalChunks((currentChunks) => {
            terminalChunkIdRef.current += 1;
            const nextChunk = {
                id: terminalChunkIdRef.current,
                text,
                stream,
            };
            return [...currentChunks, nextChunk].slice(-2000);
        });
    }, []);
    const appendLog = useCallback((message) => {
        appendTerminalChunk(`${nowLabel(message)}\n`, 'system');
    }, [appendTerminalChunk]);
    const upsertRemoteCursor = useCallback((payload) => {
        setRemoteCursors((currentCursors) => {
            const nextCursor = {
                socketId: payload.socketId,
                userName: payload.userName,
                filePath: payload.filePath,
                line: Math.max(1, payload.cursor.line || 1),
                column: Math.max(1, payload.cursor.column || 1),
            };
            const existingIndex = currentCursors.findIndex((cursor) => cursor.socketId === payload.socketId &&
                cursor.filePath === payload.filePath);
            if (existingIndex === -1) {
                return [...currentCursors, nextCursor];
            }
            const nextCursors = [...currentCursors];
            nextCursors[existingIndex] = nextCursor;
            return nextCursors;
        });
    }, []);
    const removeRemoteCursorBySocket = useCallback((socketId) => {
        setRemoteCursors((currentCursors) => currentCursors.filter((cursor) => cursor.socketId !== socketId));
    }, []);
    const expandParents = useCallback((path) => {
        const segments = path.split('/').filter(Boolean);
        setExpandedFolders((previous) => {
            const next = new Set(previous);
            for (let index = 1; index < segments.length; index += 1) {
                next.add(segments.slice(0, index).join('/'));
            }
            return next;
        });
    }, []);
    const refreshTree = useCallback(async () => {
        setIsTreeLoading(true);
        try {
            if (directoryHandle) {
                const tree = await buildTreeFromDirectoryHandle(directoryHandle);
                setTreeRoot(tree);
            }
            else {
                const response = await fetchRemoteTree('');
                setTreeRoot(response.tree);
            }
        }
        catch (error) {
            appendLog(`Failed to refresh explorer: ${error.message}`);
        }
        finally {
            setIsTreeLoading(false);
        }
    }, [appendLog, directoryHandle]);
    const persistFile = useCallback(async (path, content, options) => {
        if (!options?.skipSuppressCheck && suppressAutosaveRef.current) {
            suppressAutosaveRef.current = false;
            return;
        }
        try {
            if (directoryHandle) {
                await writeLocalFile(directoryHandle, path, content);
                return;
            }
            await writeRemoteFile(path, content, roomId);
        }
        catch (error) {
            appendLog(`Save failed for ${path}: ${error.message}`);
            if (options?.throwOnError) {
                throw error;
            }
        }
    }, [appendLog, directoryHandle, roomId]);
    const openFile = useCallback(async (node) => {
        const existingTab = openFiles.find((tab) => tab.path === node.path);
        if (existingTab) {
            setAiFixResult(null);
            setActiveFileId(existingTab.id);
            if (node.handle) {
                setOpenFiles((currentTabs) => currentTabs.map((tab) => tab.path === node.path && !tab.handle
                    ? {
                        ...tab,
                        handle: node.handle,
                    }
                    : tab));
            }
            appendLog(`Switched tab: ${node.path}`);
            return;
        }
        setIsFileLoading(true);
        setAiFixResult(null);
        try {
            const content = directoryHandle && node.handle
                ? await readLocalFileHandle(node.handle)
                : directoryHandle
                    ? await readLocalFile(directoryHandle, node.path)
                    : (await readRemoteFile(node.path)).content;
            const nextTab = {
                id: node.path,
                name: node.name || getFileNameFromPath(node.path),
                path: node.path,
                content,
                handle: node.handle,
            };
            setOpenFiles((currentTabs) => [...currentTabs, nextTab]);
            setActiveFileId(nextTab.id);
            appendLog(`Opened file: ${node.path}`);
        }
        catch (error) {
            appendLog(`Unable to open file ${node.path}: ${error.message}`);
        }
        finally {
            setIsFileLoading(false);
        }
    }, [appendLog, directoryHandle, openFiles]);
    useEffect(() => {
        activeSocket.connect();
        return () => {
            activeSocket.disconnect();
        };
    }, [activeSocket]);
    useEffect(() => {
        activeSocket.emit('join-room', {
            roomId,
            userName,
        });
        appendLog(`Joined room: ${roomId}`);
    }, [activeSocket, appendLog, roomId, userName]);
    useEffect(() => {
        onSessionChange?.({
            roomId,
            userName,
        });
    }, [onSessionChange, roomId, userName]);
    useEffect(() => {
        setRoomUsers([]);
        setRemoteCursors([]);
        localCursorRef.current = null;
    }, [roomId]);
    useEffect(() => {
        const onCodeUpdate = (payload) => {
            if (payload.roomId !== roomId) {
                return;
            }
            setOpenFiles((currentTabs) => {
                let changed = false;
                const nextTabs = currentTabs.map((tab) => {
                    if (tab.path !== payload.filePath) {
                        return tab;
                    }
                    changed = true;
                    return {
                        ...tab,
                        content: payload.content || '',
                    };
                });
                if (changed) {
                    suppressAutosaveRef.current = true;
                    return nextTabs;
                }
                return currentTabs;
            });
            if (payload.cursor && payload.socketId && payload.userName) {
                upsertRemoteCursor({
                    socketId: payload.socketId,
                    userName: payload.userName,
                    filePath: payload.filePath,
                    cursor: payload.cursor,
                });
            }
        };
        const onCursorUpdate = (payload) => {
            if (!payload || payload.roomId !== roomId || !payload.cursor) {
                return;
            }
            upsertRemoteCursor({
                socketId: payload.socketId,
                userName: payload.userName || 'anonymous',
                filePath: payload.filePath,
                cursor: payload.cursor,
            });
        };
        const onFsEvent = (payload) => {
            if (payload.roomId && payload.roomId !== roomId) {
                return;
            }
            if (!directoryHandle) {
                void refreshTree();
            }
            if (payload.userName) {
                appendLog(`${payload.userName} updated the workspace`);
            }
        };
        const onRoomUsers = (payload) => {
            if (!payload || payload.roomId !== roomId) {
                return;
            }
            const users = Array.isArray(payload.users) ? payload.users : [];
            setRoomUsers(users);
            const activeUserIds = new Set(users.map((user) => user.socketId));
            setRemoteCursors((currentCursors) => currentCursors.filter((cursor) => activeUserIds.has(cursor.socketId)));
        };
        const onUserJoined = (payload) => {
            if (!payload || payload.roomId !== roomId) {
                return;
            }
            appendLog(payload.message || `${payload.userName || 'A collaborator'} joined`);
        };
        const onUserLeft = (payload) => {
            if (!payload || payload.roomId !== roomId) {
                return;
            }
            if (payload.socketId) {
                removeRemoteCursorBySocket(payload.socketId);
            }
            appendLog(payload.message || `${payload.userName || 'A collaborator'} disconnected`);
        };
        activeSocket.on('code-change', onCodeUpdate);
        activeSocket.on('code-update', onCodeUpdate);
        activeSocket.on('cursor-update', onCursorUpdate);
        activeSocket.on('fs-event', onFsEvent);
        activeSocket.on('room-users', onRoomUsers);
        activeSocket.on('user-joined', onUserJoined);
        activeSocket.on('user-left', onUserLeft);
        return () => {
            activeSocket.off('code-change', onCodeUpdate);
            activeSocket.off('code-update', onCodeUpdate);
            activeSocket.off('cursor-update', onCursorUpdate);
            activeSocket.off('fs-event', onFsEvent);
            activeSocket.off('room-users', onRoomUsers);
            activeSocket.off('user-joined', onUserJoined);
            activeSocket.off('user-left', onUserLeft);
        };
    }, [
        activeSocket,
        appendLog,
        directoryHandle,
        refreshTree,
        roomId,
        removeRemoteCursorBySocket,
        upsertRemoteCursor,
    ]);
    useEffect(() => {
        const onExecutionStarted = (payload) => {
            setIsExecutionRunning(true);
            const languageLabel = typeof payload.language === 'string' ? payload.language.toUpperCase() : 'CODE';
            appendTerminalChunk(`\n▶ Running ${payload.fileName || 'program'} (${languageLabel})...\n`, 'system');
        };
        const onExecutionOutput = (payload) => {
            if (!payload || typeof payload.chunk !== 'string') {
                return;
            }
            const stream = payload.stream === 'stderr' || payload.stream === 'system' ? payload.stream : 'stdout';
            appendTerminalChunk(payload.chunk, stream);
        };
        const onExecutionError = (payload) => {
            setIsExecutionRunning(false);
            appendTerminalChunk(`\n${payload.message || 'Execution failed.'}\n`, 'stderr');
        };
        const onExecutionFinished = (payload) => {
            setIsExecutionRunning(false);
            const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : 'null';
            const signalSuffix = payload.signal ? ` (signal: ${payload.signal})` : '';
            const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : 0;
            appendTerminalChunk(`\nProcess finished with exit code ${exitCode}${signalSuffix} in ${durationMs} ms.\n`, 'system');
        };
        activeSocket.on('execution-started', onExecutionStarted);
        activeSocket.on('execution-output', onExecutionOutput);
        activeSocket.on('execution-error', onExecutionError);
        activeSocket.on('execution-finished', onExecutionFinished);
        return () => {
            activeSocket.off('execution-started', onExecutionStarted);
            activeSocket.off('execution-output', onExecutionOutput);
            activeSocket.off('execution-error', onExecutionError);
            activeSocket.off('execution-finished', onExecutionFinished);
        };
    }, [activeSocket, appendTerminalChunk]);
    useEffect(() => {
        void refreshTree();
    }, [refreshTree]);
    useEffect(() => {
        let cancelled = false;
        const restoreDirectory = async () => {
            try {
                const persistedHandle = await loadPersistedDirectoryHandle();
                if (!persistedHandle || cancelled) {
                    return;
                }
                const hasPermission = await ensureHandlePermission(persistedHandle);
                if (!hasPermission || cancelled) {
                    return;
                }
                setDirectoryHandle(persistedHandle);
                appendLog(`Restored local directory: ${persistedHandle.name}`);
            }
            catch {
                // Ignore restoration errors and continue with remote mode.
            }
        };
        void restoreDirectory();
        return () => {
            cancelled = true;
        };
    }, [appendLog]);
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
            if (codeSyncTimeoutRef.current) {
                window.clearTimeout(codeSyncTimeoutRef.current);
            }
            if (cursorSyncTimeoutRef.current) {
                window.clearTimeout(cursorSyncTimeoutRef.current);
            }
        };
    }, []);
    const emitCodeChange = useCallback((filePath, content, cursor, syncSequence) => {
        activeSocket.timeout(3000).emit('code-change', {
            roomId,
            filePath,
            content,
            cursor,
        }, (error, response) => {
            if (typeof syncSequence === 'number' && syncSequence !== latestSyncSequenceRef.current) {
                return;
            }
            if (error || !response?.ok) {
                setSyncStatus('error');
                return;
            }
            setSyncStatus('synced');
        });
    }, [activeSocket, roomId]);
    useEffect(() => {
        if (!explorerContextMenu) {
            return;
        }
        const handleClose = () => setExplorerContextMenu(null);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setExplorerContextMenu(null);
            }
        };
        window.addEventListener('click', handleClose);
        window.addEventListener('resize', handleClose);
        window.addEventListener('scroll', handleClose, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', handleClose);
            window.removeEventListener('resize', handleClose);
            window.removeEventListener('scroll', handleClose, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [explorerContextMenu]);
    const handleExplorerContextMenu = useCallback((event, path, kind) => {
        event.preventDefault();
        event.stopPropagation();
        setExplorerContextMenu({
            x: Math.min(event.clientX, window.innerWidth - 220),
            y: Math.min(event.clientY, window.innerHeight - 220),
            path,
            kind,
        });
    }, []);
    const handleEditorChange = (value) => {
        if (!activeFile) {
            return;
        }
        latestSyncSequenceRef.current += 1;
        const syncSequence = latestSyncSequenceRef.current;
        setSyncStatus('typing');
        setOpenFiles((currentTabs) => currentTabs.map((tab) => tab.id === activeFile.id
            ? {
                ...tab,
                content: value,
            }
            : tab));
        if (codeSyncTimeoutRef.current) {
            window.clearTimeout(codeSyncTimeoutRef.current);
        }
        const currentPath = activeFile.path;
        codeSyncTimeoutRef.current = window.setTimeout(() => {
            setSyncStatus('syncing');
            emitCodeChange(currentPath, value, localCursorRef.current, syncSequence);
        }, 150);
        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
            void persistFile(currentPath, value);
        }, 500);
    };
    const handleCursorChange = (cursor) => {
        if (!activeFile) {
            return;
        }
        localCursorRef.current = cursor;
        if (cursorSyncTimeoutRef.current) {
            window.clearTimeout(cursorSyncTimeoutRef.current);
        }
        const currentPath = activeFile.path;
        cursorSyncTimeoutRef.current = window.setTimeout(() => {
            activeSocket.emit('cursor-change', {
                roomId,
                filePath: currentPath,
                cursor,
            });
        }, 80);
    };
    const handleToggleFolder = (path) => {
        setExpandedFolders((previous) => {
            const next = new Set(previous);
            if (next.has(path)) {
                next.delete(path);
            }
            else {
                next.add(path);
            }
            return next;
        });
    };
    const handleOpenLocalFolder = async () => {
        try {
            const handle = await pickDirectory();
            setDirectoryHandle(handle);
            setOpenFiles([]);
            setActiveFileId(null);
            setAiFixResult(null);
            appendLog(`Local folder selected: ${handle.name}`);
        }
        catch (error) {
            appendLog(`Open Folder failed: ${error.message}`);
        }
    };
    const handleSwitchToServerFs = () => {
        setDirectoryHandle(null);
        setOpenFiles([]);
        setActiveFileId(null);
        setAiFixResult(null);
        appendLog('Switched to server filesystem mode');
    };
    const handleCreateFile = async (basePath = selectedFilePath, baseKind = null) => {
        const suggestedPath = buildDefaultSiblingPath(basePath, 'new-file.ts', baseKind);
        const targetPath = window.prompt('Create file at path (relative)', suggestedPath)?.trim();
        if (!targetPath) {
            return;
        }
        try {
            if (directoryHandle) {
                await createLocalFile(directoryHandle, targetPath);
            }
            else {
                await createRemoteFile(targetPath, roomId);
            }
            activeSocket.emit('fs-event', { roomId, type: 'file-created', path: targetPath });
            expandParents(targetPath);
            await refreshTree();
            const nextTab = {
                id: targetPath,
                name: getFileNameFromPath(targetPath),
                path: targetPath,
                content: '',
            };
            setOpenFiles((currentTabs) => {
                const existingTab = currentTabs.find((tab) => tab.path === targetPath);
                if (existingTab) {
                    return currentTabs;
                }
                return [...currentTabs, nextTab];
            });
            setActiveFileId(nextTab.id);
            setAiFixResult(null);
            appendLog(`File created: ${targetPath}`);
        }
        catch (error) {
            appendLog(`Create file failed: ${error.message}`);
        }
    };
    const handleCreateFolder = async (basePath = selectedFilePath, baseKind = null) => {
        const suggestedPath = buildDefaultSiblingPath(basePath, 'new-folder', baseKind);
        const targetPath = window.prompt('Create folder at path (relative)', suggestedPath)?.trim();
        if (!targetPath) {
            return;
        }
        try {
            if (directoryHandle) {
                await createLocalFolder(directoryHandle, targetPath);
            }
            else {
                await createRemoteFolder(targetPath, roomId);
            }
            activeSocket.emit('fs-event', { roomId, type: 'folder-created', path: targetPath });
            expandParents(targetPath);
            setExpandedFolders((previous) => {
                const next = new Set(previous);
                next.add(targetPath);
                return next;
            });
            await refreshTree();
            appendLog(`Folder created: ${targetPath}`);
        }
        catch (error) {
            appendLog(`Create folder failed: ${error.message}`);
        }
    };
    const handleRenamePath = async (initialPath = selectedFilePath) => {
        const oldPath = window.prompt('Rename which path?', initialPath || '')?.trim();
        if (!oldPath) {
            return;
        }
        const newPath = window.prompt('New path', oldPath)?.trim();
        if (!newPath || newPath === oldPath) {
            return;
        }
        try {
            if (directoryHandle) {
                await renameLocalPath(directoryHandle, oldPath, newPath);
            }
            else {
                await renameRemotePath(oldPath, newPath, roomId);
            }
            activeSocket.emit('fs-event', {
                roomId,
                type: 'path-renamed',
                oldPath,
                newPath,
            });
            setOpenFiles((currentTabs) => currentTabs.map((tab) => {
                if (tab.path === oldPath || tab.path.startsWith(`${oldPath}/`)) {
                    const nextPath = tab.path.replace(oldPath, newPath);
                    return {
                        ...tab,
                        id: nextPath,
                        path: nextPath,
                        name: getFileNameFromPath(nextPath),
                    };
                }
                return tab;
            }));
            setActiveFileId((currentActiveId) => {
                if (!currentActiveId) {
                    return null;
                }
                if (currentActiveId === oldPath || currentActiveId.startsWith(`${oldPath}/`)) {
                    return currentActiveId.replace(oldPath, newPath);
                }
                return currentActiveId;
            });
            expandParents(newPath);
            await refreshTree();
            appendLog(`Renamed: ${oldPath} -> ${newPath}`);
        }
        catch (error) {
            appendLog(`Rename failed: ${error.message}`);
        }
    };
    const handleDeletePath = async (initialPath = selectedFilePath) => {
        const targetPath = window.prompt('Delete which path?', initialPath || '')?.trim();
        if (!targetPath) {
            return;
        }
        const shouldDelete = window.confirm(`Delete "${targetPath}" recursively?`);
        if (!shouldDelete) {
            return;
        }
        try {
            if (directoryHandle) {
                await deleteLocalPath(directoryHandle, targetPath);
            }
            else {
                await deleteRemotePath(targetPath, roomId);
            }
            activeSocket.emit('fs-event', {
                roomId,
                type: 'path-deleted',
                path: targetPath,
            });
            setOpenFiles((currentTabs) => {
                const activeIndex = currentTabs.findIndex((tab) => tab.id === activeFileId);
                const remainingTabs = currentTabs.filter((tab) => !(tab.path === targetPath || tab.path.startsWith(`${targetPath}/`)));
                if (activeFileId &&
                    (activeFileId === targetPath || activeFileId.startsWith(`${targetPath}/`))) {
                    const fallbackIndex = Math.min(activeIndex, remainingTabs.length - 1);
                    setActiveFileId(fallbackIndex >= 0 ? remainingTabs[fallbackIndex].id : null);
                    setAiFixResult(null);
                }
                return remainingTabs;
            });
            await refreshTree();
            appendLog(`Deleted path: ${targetPath}`);
        }
        catch (error) {
            appendLog(`Delete failed: ${error.message}`);
        }
    };
    const handleFixWithAi = async () => {
        if (!activeFile || !activeFile.content.trim()) {
            appendLog('Fix with AI skipped: editor is empty');
            return;
        }
        setIsFixing(true);
        try {
            const result = await requestAiFix(activeFile.content, getLanguageFromPath(activeFile.path));
            setAiFixResult(result);
            appendLog(`AI fix generated (${result.model || 'Gemini'})`);
        }
        catch (error) {
            appendLog(`Fix with AI failed: ${error.message}`);
        }
        finally {
            setIsFixing(false);
        }
    };
    const handleApplyFix = async () => {
        if (!aiFixResult || !activeFile) {
            return;
        }
        setOpenFiles((currentTabs) => currentTabs.map((tab) => tab.id === activeFile.id
            ? {
                ...tab,
                content: aiFixResult.correctedCode,
            }
            : tab));
        await persistFile(activeFile.path, aiFixResult.correctedCode);
        setSyncStatus('syncing');
        emitCodeChange(activeFile.path, aiFixResult.correctedCode, null);
        appendLog('Applied AI correction to editor');
        setAiFixResult(null);
    };
    const handleRunCode = async () => {
        if (!activeFile) {
            appendLog('Run skipped: open a file before executing');
            return;
        }
        if (isExecutionRunning) {
            appendTerminalChunk('A process is already running. Stop it before starting a new run.\n', 'system');
            return;
        }
        try {
            await persistFile(activeFile.path, activeFile.content, {
                skipSuppressCheck: true,
                throwOnError: true,
            });
        }
        catch (error) {
            appendTerminalChunk(`Auto-save failed. Execution cancelled: ${error.message}\n`, 'stderr');
            return;
        }
        const fileName = activeFile.name || getFileNameFromPath(activeFile.path);
        activeSocket.emit('run-code', {
            fileName,
            fileContent: activeFile.content,
            language: selectedRunLanguage,
        });
    };
    const handleStopExecution = () => {
        if (!isExecutionRunning) {
            return;
        }
        activeSocket.emit('stop-execution');
    };
    const handleTerminalInput = (data) => {
        if (!isExecutionRunning || !data) {
            return;
        }
        activeSocket.emit('terminal-input', { data });
    };
    const handleSelectTab = (tabId) => {
        setActiveFileId(tabId);
        setAiFixResult(null);
        localCursorRef.current = null;
    };
    const handleCloseTab = (tabId) => {
        setOpenFiles((currentTabs) => {
            const closingTabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
            if (closingTabIndex === -1) {
                return currentTabs;
            }
            const remainingTabs = currentTabs.filter((tab) => tab.id !== tabId);
            setActiveFileId((currentActiveId) => {
                if (currentActiveId !== tabId) {
                    return currentActiveId;
                }
                if (remainingTabs.length === 0) {
                    return null;
                }
                const fallbackIndex = Math.min(closingTabIndex, remainingTabs.length - 1);
                return remainingTabs[fallbackIndex].id;
            });
            return remainingTabs;
        });
        setAiFixResult(null);
    };
    const runExplorerAction = (action) => () => {
        setExplorerContextMenu(null);
        void action();
    };
    const explorerNodes = treeRoot?.children || [];
    const explorerContextMenuItems = [];
    if (explorerContextMenu?.kind === 'sidebar') {
        explorerContextMenuItems.push({
            label: 'New File',
            icon: FilePlus2,
            onClick: runExplorerAction(() => handleCreateFile(null)),
        }, {
            label: 'New Folder',
            icon: FolderPlus,
            onClick: runExplorerAction(() => handleCreateFolder(null)),
        }, {
            label: 'Refresh',
            icon: RefreshCw,
            onClick: runExplorerAction(refreshTree),
        }, {
            label: 'Open Local Folder',
            icon: FolderOpen,
            onClick: runExplorerAction(handleOpenLocalFolder),
            separatorAbove: true,
        }, {
            label: 'Switch to Server Workspace',
            icon: HardDrive,
            onClick: runExplorerAction(async () => {
                handleSwitchToServerFs();
            }),
            disabled: !directoryHandle,
        });
    }
    if (explorerContextMenu?.kind === 'folder' && explorerContextMenu.path) {
        explorerContextMenuItems.push({
            label: 'New File',
            icon: FilePlus2,
            onClick: runExplorerAction(() => handleCreateFile(explorerContextMenu.path, 'folder')),
        }, {
            label: 'New Folder',
            icon: FolderPlus,
            onClick: runExplorerAction(() => handleCreateFolder(explorerContextMenu.path, 'folder')),
        });
    }
    if (explorerContextMenu?.path) {
        explorerContextMenuItems.push({
            label: 'Rename',
            icon: Pencil,
            onClick: runExplorerAction(() => handleRenamePath(explorerContextMenu.path)),
            shortcut: 'F2',
            separatorAbove: explorerContextMenu.kind === 'folder',
        }, {
            label: 'Delete',
            icon: Trash2,
            onClick: runExplorerAction(() => handleDeletePath(explorerContextMenu.path)),
            shortcut: 'Del',
            danger: true,
        });
    }
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "topbar", children: [_jsx("div", { className: "brand", children: "CollaBrix" }), _jsxs("div", { className: "topbar-room", children: [_jsx("label", { htmlFor: "room-id", children: "Room" }), _jsx("input", { id: "room-id", value: roomId, onChange: (event) => setRoomId(event.target.value.trim() || DEFAULT_ROOM) })] }), _jsxs("div", { className: "topbar-presence", children: [_jsx("span", { className: "topbar-presence-label", children: "Online" }), _jsx("div", { className: "topbar-presence-list", children: visibleRoomUsers.map((member) => (_jsx("span", { className: `topbar-presence-chip ${member.socketId === activeSocket.id ? 'topbar-presence-chip--self' : ''}`, title: member.userName, children: member.userName }, member.socketId))) })] }), _jsxs("div", { className: "mode-tag", children: ["Mode: ", directoryHandle ? 'Local Folder' : 'Server Workspace'] }), userName && userName !== 'collabrix-user' && (_jsxs("div", { className: "topbar-user", children: [_jsx("span", { className: "topbar-user-avatar", children: userName.charAt(0).toUpperCase() }), _jsx("span", { className: "topbar-user-name", children: userName })] }))] }), _jsxs("div", { className: "workspace-layout", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-header", children: [_jsx("div", { className: "sidebar-title", children: "EXPLORER" }), _jsxs("div", { className: "sidebar-header-actions", children: [_jsx("button", { type: "button", className: "sidebar-icon-button", title: "Open Local Folder", "aria-label": "Open Local Folder", onClick: () => {
                                                    setExplorerContextMenu(null);
                                                    void handleOpenLocalFolder();
                                                }, children: _jsx(FolderOpen, { size: 14, strokeWidth: 1.9 }) }), _jsx("button", { type: "button", className: "sidebar-icon-button", title: "New File", "aria-label": "New File", onClick: () => {
                                                    setExplorerContextMenu(null);
                                                    void handleCreateFile();
                                                }, children: _jsx(FilePlus2, { size: 14, strokeWidth: 1.9 }) }), _jsx("button", { type: "button", className: "sidebar-icon-button", title: "New Folder", "aria-label": "New Folder", onClick: () => {
                                                    setExplorerContextMenu(null);
                                                    void handleCreateFolder();
                                                }, children: _jsx(FolderPlus, { size: 14, strokeWidth: 1.9 }) }), _jsx("button", { type: "button", className: "sidebar-icon-button", title: "Refresh Explorer", "aria-label": "Refresh Explorer", onClick: () => {
                                                    setExplorerContextMenu(null);
                                                    void refreshTree();
                                                }, children: _jsx(RefreshCw, { size: 14, strokeWidth: 1.9 }) })] })] }), _jsxs("div", { className: "workspace-header", onContextMenu: (event) => handleExplorerContextMenu(event, null, 'sidebar'), children: [_jsxs("div", { className: "workspace-header-row", children: [_jsx(FolderOpen, { className: "workspace-header-icon", size: 14, strokeWidth: 1.9 }), _jsx("span", { className: "workspace-name", children: treeRoot?.name || 'Workspace' })] }), _jsx("span", { className: "workspace-mode", children: directoryHandle ? 'LOCAL FOLDER' : 'SERVER WORKSPACE' })] }), _jsx("div", { className: "tree-container", onContextMenu: (event) => {
                                    const target = event.target;
                                    if (!target.closest('.tree-row')) {
                                        handleExplorerContextMenu(event, null, 'sidebar');
                                    }
                                }, children: isTreeLoading ? (_jsx("div", { className: "placeholder", children: "Loading explorer..." })) : (_jsx(FileTree, { nodes: explorerNodes, expandedFolders: expandedFolders, selectedFilePath: selectedFilePath, contextMenuPath: explorerContextMenu?.path || null, onToggleFolder: handleToggleFolder, onSelectFile: (node) => {
                                        expandParents(node.path);
                                        void openFile(node);
                                    }, onItemContextMenu: (event, node) => handleExplorerContextMenu(event, node.path, node.kind) })) }), explorerContextMenu ? (_jsx(ExplorerContextMenu, { x: explorerContextMenu.x, y: explorerContextMenu.y, items: explorerContextMenuItems })) : null] }), _jsxs("section", { className: "editor-pane", children: [_jsxs("div", { className: "editor-header", children: [_jsxs("div", { className: "editor-header-meta", children: [_jsx("span", { children: activeFile?.path || 'No file selected' }), _jsx("span", { className: `editor-sync-status editor-sync-status--${syncStatus}`, children: syncStatus === 'error' ? 'Sync failed' : syncStatus === 'synced' ? 'Synced' : 'Syncing...' })] }), _jsxs("div", { className: "editor-actions", children: [_jsx("button", { type: "button", onClick: handleFixWithAi, disabled: isFixing || !activeFile, children: isFixing ? 'Fixing...' : 'Fix with AI' }), aiFixResult && (_jsx("button", { type: "button", onClick: handleApplyFix, children: "Apply Fix" }))] })] }), _jsx(EditorTabs, { tabs: openFiles, activeFileId: activeFileId, onSelectTab: handleSelectTab, onCloseTab: handleCloseTab }), _jsx(Editor, { filePath: selectedFilePath, value: editorCode, language: getLanguageFromPath(selectedFilePath), onChange: handleEditorChange, onCursorChange: handleCursorChange, remoteCursors: activeFileRemoteCursors, disabled: !activeFile || isFileLoading, placeholder: activeFile
                                    ? 'Start coding...'
                                    : 'Select a file from the explorer to open it in the editor.' }), aiFixResult && (_jsx("div", { className: "diff-wrapper", children: _jsx(DiffView, { originalCode: aiFixResult.originalCode || editorCode, correctedCode: aiFixResult.correctedCode }) }))] })] }), _jsx(TerminalPanel, { terminalChunks: terminalChunks, selectedLanguage: selectedRunLanguage, onLanguageChange: setSelectedRunLanguage, onRun: handleRunCode, onStop: handleStopExecution, onInput: handleTerminalInput, isRunning: isExecutionRunning, runDisabled: !activeFile || isFileLoading })] }));
}
export default App;

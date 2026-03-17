
//------------------------------------------------------(HEART)---------------------------------------------------------

let activeTab = "file";
let isRetracted = false;
let editors = {};
let users = [];
let userCursors = [];
let fileCount = 1;
let currentDivOfFile = null;
fileExtension = "py";
let directoryHandle = null; // Global variable to store the directory handle
let fileHandles = {}; // Object to store file handles by path
let directoryHandles = {}; // Object to store directory handles by path
let localSaveTimers = {}; // Debounce timers per editor key
const LOCAL_SAVE_DEBOUNCE_MS = 350;
const LOCAL_FS_DB_NAME = 'collabrix-local-fs';
const LOCAL_FS_DB_STORE = 'handles';
const LOCAL_FS_DB_KEY = 'root-directory-handle';

// ─── File System Tree (JSON) ──────────────────────────────────────────────────
// Each folder node: { id, name, type:'folder', path, children:[] }
// Each file node:   { id, name, type:'file',   path, parentId }
let fileSystemTree = [];
let nodeIdCounter  = 0;

// ─── Selected Folder Tracking ─────────────────────────────────────────────────
let selectedFolderEl         = null;  // .folder DOM element currently selected
let selectedFolderChildrenEl = null;  // corresponding .folder-children container
let selectedFolderPath       = '';    // e.g. 'src/utils' – '' means root
let selectedFolderId         = null;  // node id in fileSystemTree (null = root)

// ─── Bottom Terminal State ───────────────────────────────────────────────────
let inputArea = null;
let outputArea = null;
let terminalHeight = 240;
const TERMINAL_MIN_HEIGHT = 140;
let aiGenInProgress = false;
let pendingFixCode = null;
let pendingOriginalCode = null;

/*
 * setTabLabel:
 * Sets icon + name HTML inside a .tabEditor element and sets data-ext for CSS file-type styling.
 */
function setTabLabel(el, fileName) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    el.setAttribute('data-ext', ext);
    el.setAttribute('data-filename', fileName);  // store clean name for later reads
    el.innerHTML = '<span class="item-icon"></span><span class="item-name">' + fileName + '</span>';
}

/*
 * setActiveTab:
 * Removes 'active' from every .tabEditor in the entire tree, then marks only
 * the given element as active. Single-selection — files are the only active nodes.
 */
function setActiveTab(el) {
    document.querySelectorAll('#file .tabEditor').forEach(t => {
        t.classList.remove('active');
    });
    if (el) el.classList.add('active');
}

/*
 * buildFolderRowHTML:
 * Returns the inner HTML string for a folder row (chevron + icon + name).
 */
function buildFolderRowHTML(name) {
    return '<span class="folder-chevron"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg></span>' +
           '<span class="item-icon"></span>' +
           '<span class="item-name">' + name + '</span>' +
           '<span class="folder-row-actions">' +
                '<button class="folder-action-btn" title="Edit Folder" onclick="startFolderRename(event)">' +
                    '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M11.7 1.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-7.9 7.9-3.3.6a.5.5 0 0 1-.58-.58l.6-3.3 7.9-7.9zm1 2.3l-1-1-7.4 7.4-.36 2 2-.36 7.4-7.4z"/></svg>' +
                '</button>' +
                '<button class="folder-action-btn" title="Delete Folder" onclick="requestFolderDelete(event)">' +
                    '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6 1h4l.5.5V3H14v1H2V3h3.5V1.5L6 1zm-2 4h8l-.6 9.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L4 5zm3 2v6h1V7H7zm2 0v6h1V7H9z"/></svg>' +
                '</button>' +
           '</span>';
}

/*
 * addItemToFolder:
 * Recursively searches the fileSystemTree for a folder whose id === parentId
 * and pushes newItem into its children array.
 * Returns true when the insertion succeeds, false when the parent is not found.
 */
function addItemToFolder(tree, parentId, newItem) {
    for (const node of tree) {
        if (node.type === 'folder') {
            if (node.id === parentId) {
                node.children.push(newItem);
                return true;
            }
            if (node.children && addItemToFolder(node.children, parentId, newItem)) return true;
        }
    }
    return false;
}

/*
 * removeFolderFromTree:
 * Recursively removes a folder node from the JSON tree.
 * Returns the removed node (including all nested children), or null if not found.
 */
function removeFolderFromTree(tree, folderId) {
    for (let i = 0; i < tree.length; i++) {
        const node = tree[i];
        if (node.type !== 'folder') continue;
        if (node.id === folderId) {
            return tree.splice(i, 1)[0];
        }
        if (node.children) {
            const removed = removeFolderFromTree(node.children, folderId);
            if (removed) return removed;
        }
    }
    return null;
}

/*
 * renameFolderInTree:
 * Recursively finds a folder by id, updates its name/path,
 * and rewrites descendant paths.
 */
function renameFolderInTree(tree, folderId, newName) {
    for (const node of tree) {
        if (node.type !== 'folder') continue;

        if (node.id === folderId) {
            const oldPath = node.path;
            const slashIndex = oldPath.lastIndexOf('/');
            const parentPath = slashIndex === -1 ? '' : oldPath.slice(0, slashIndex);
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;

            node.name = newName;
            node.path = newPath;
            rewriteDescendantPaths(node);
            return { oldPath, newPath };
        }

        if (node.children) {
            const renamed = renameFolderInTree(node.children, folderId, newName);
            if (renamed) return renamed;
        }
    }
    return null;
}

/*
 * rewriteDescendantPaths:
 * Rewrites path for all descendants of a folder node after rename.
 */
function rewriteDescendantPaths(folderNode) {
    if (!folderNode.children) return;
    for (const child of folderNode.children) {
        child.path = `${folderNode.path}/${child.name}`;
        if (child.type === 'folder') {
            rewriteDescendantPaths(child);
        }
    }
}

/*
 * replacePathPrefix:
 * Replaces oldPrefix with newPrefix when a path belongs to a renamed folder.
 */
function replacePathPrefix(path, oldPrefix, newPrefix) {
    if (!path || !oldPrefix) return path;
    if (path === oldPrefix) return newPrefix;
    if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}${path.slice(oldPrefix.length)}`;
    return path;
}

/*
 * findFolderDomById:
 * Returns the folder row DOM element for a folder id.
 */
function findFolderDomById(folderId) {
    return document.querySelector(`.folder[data-folder-id="${folderId}"]`);
}

/*
 * findFolderDomByPath:
 * Returns folder row DOM element by its dataset.path value.
 */
function findFolderDomByPath(folderPath) {
    return Array.from(document.querySelectorAll('#file .folder')).find((el) => (el.dataset.path || '') === folderPath) || null;
}

/*
 * findFolderIdByPath:
 * Recursively finds folder id in the JSON tree by path.
 */
function findFolderIdByPath(tree, folderPath) {
    for (const node of tree) {
        if (node.type !== 'folder') continue;
        if (node.path === folderPath) return node.id;
        if (node.children) {
            const nested = findFolderIdByPath(node.children, folderPath);
            if (nested !== null) return nested;
        }
    }
    return null;
}

/*
 * isPathInTree:
 * Returns true if any node already exists for the given full path.
 */
function isPathInTree(tree, targetPath) {
    for (const node of tree) {
        if (node.path === targetPath) return true;
        if (node.type === 'folder' && node.children && isPathInTree(node.children, targetPath)) {
            return true;
        }
    }
    return false;
}

/*
 * getContainerByFolderPath:
 * Returns insertion container + depth for a folder path (or root when absent).
 */
function getContainerByFolderPath(parentPath) {
    const root = document.getElementById('file');
    if (!parentPath) {
        return { container: root, depth: 0 };
    }

    const folderDiv = findFolderDomByPath(parentPath);
    if (!folderDiv) {
        return { container: root, depth: 0 };
    }

    const childrenDiv = folderDiv.nextElementSibling;
    if (!childrenDiv || !childrenDiv.classList.contains('folder-children')) {
        return { container: root, depth: 0 };
    }

    if (folderDiv.classList.contains('collapsed')) {
        toggleFolder(folderDiv, childrenDiv);
    }

    return { container: childrenDiv, depth: getContainerDepth(childrenDiv) };
}

/*
 * resolveFolderId:
 * Resolves a folder id from explicit id or fallback path.
 */
function resolveFolderId(folderId, folderPath = '') {
    const parsedId = parseInt(folderId, 10);
    if (Number.isFinite(parsedId)) {
        const exactDom = findFolderDomById(parsedId);
        if (exactDom) return parsedId;
    }

    if (folderPath) {
        const folderByPath = findFolderDomByPath(folderPath);
        if (folderByPath) {
            const domId = parseInt(folderByPath.dataset.folderId || '', 10);
            if (Number.isFinite(domId)) return domId;
        }

        const treeId = findFolderIdByPath(fileSystemTree, folderPath);
        if (treeId !== null) return treeId;
    }

    return null;
}

/*
 * syncFileHandlePathsAfterRename:
 * Rewrites keys in fileHandles when a folder path changes.
 */
function syncFileHandlePathsAfterRename(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    const remapped = {};
    Object.keys(fileHandles).forEach((key) => {
        const nextKey = replacePathPrefix(key, oldPath, newPath);
        remapped[nextKey] = fileHandles[key];
    });
    fileHandles = remapped;
}

/*
 * removeFileHandlePaths:
 * Removes all file handle entries under a deleted folder path.
 */
function removeFileHandlePaths(folderPath) {
    if (!folderPath) return;
    Object.keys(fileHandles).forEach((key) => {
        if (key === folderPath || key.startsWith(`${folderPath}/`)) {
            delete fileHandles[key];
        }
    });
}

function normalizePath(path = '') {
    return String(path)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\/+/g, '/');
}

function getParentPath(path = '') {
    const cleanPath = normalizePath(path);
    if (!cleanPath.includes('/')) return '';
    return cleanPath.slice(0, cleanPath.lastIndexOf('/'));
}

function getFileTabByEditorKey(editorKey) {
    const suffix = String(editorKey || '').split('r').pop();
    if (!suffix) return null;
    return document.getElementById(`file${suffix}`);
}

function getEditorPathByKey(editorKey) {
    const tab = getFileTabByEditorKey(editorKey);
    const fallbackName = editors[editorKey]?.[1] || '';
    const tabPath = tab?.dataset?.path || tab?.getAttribute('data-filename') || fallbackName;
    return normalizePath(tabPath);
}

function syncDirectoryHandlePathsAfterRename(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    const remapped = {};
    Object.keys(directoryHandles).forEach((key) => {
        if (key === '') {
            remapped[key] = directoryHandles[key];
            return;
        }
        const nextKey = replacePathPrefix(key, oldPath, newPath);
        remapped[nextKey] = directoryHandles[key];
    });
    directoryHandles = remapped;
}

function removeDirectoryHandlePaths(folderPath) {
    if (!folderPath) return;
    Object.keys(directoryHandles).forEach((key) => {
        if (key === '') return;
        if (key === folderPath || key.startsWith(`${folderPath}/`)) {
            delete directoryHandles[key];
        }
    });
}

async function ensureDirectoryHandleForPath(folderPath, create = false) {
    if (!directoryHandle) return null;

    const targetPath = normalizePath(folderPath);
    if (!targetPath) {
        directoryHandles[''] = directoryHandle;
        return directoryHandle;
    }

    if (directoryHandles[targetPath]) return directoryHandles[targetPath];

    const segments = targetPath.split('/').filter(Boolean);
    let currentHandle = directoryHandle;
    let currentPath = '';

    for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (directoryHandles[currentPath]) {
            currentHandle = directoryHandles[currentPath];
            continue;
        }
        currentHandle = await currentHandle.getDirectoryHandle(segment, { create });
        directoryHandles[currentPath] = currentHandle;
    }

    return currentHandle;
}

async function ensureFileHandleForPath(filePath, create = false) {
    const targetPath = normalizePath(filePath);
    if (!targetPath) return null;

    if (fileHandles[targetPath]) return fileHandles[targetPath];

    const parentPath = getParentPath(targetPath);
    const fileName = targetPath.split('/').pop();
    const parentHandle = await ensureDirectoryHandleForPath(parentPath, create);
    if (!parentHandle) return null;

    const handle = await parentHandle.getFileHandle(fileName, { create });
    fileHandles[targetPath] = handle;
    return handle;
}

async function writeContentToLocalFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

function scheduleLocalAutoSave(editorKey) {
    if (!editorKey || !directoryHandle) return;
    const editorPath = getEditorPathByKey(editorKey);
    const tab = getFileTabByEditorKey(editorKey);
    const isLocalBacked = (tab?.dataset?.local === 'true') || Boolean(fileHandles[editorPath]);
    if (!isLocalBacked) return;

    if (localSaveTimers[editorKey]) {
        clearTimeout(localSaveTimers[editorKey]);
    }

    localSaveTimers[editorKey] = window.setTimeout(() => {
        saveEditorToLocalDisk(editorKey, { createIfMissing: true, showStatus: false });
    }, LOCAL_SAVE_DEBOUNCE_MS);
}

async function saveEditorToLocalDisk(editorKey, options = {}) {
    if (!directoryHandle) {
        if (options.showStatus) {
            appendDebugMessage('No local folder selected. Use Open Folder first.');
        }
        return false;
    }
    if (!editorKey || !editors[editorKey]) return false;

    const fullPath = getEditorPathByKey(editorKey);
    if (!fullPath) return false;

    const shouldCreate = options.createIfMissing === true;
    try {
        let handle = fileHandles[fullPath];
        if (!handle) {
            handle = await ensureFileHandleForPath(fullPath, shouldCreate);
        }
        if (!handle) return false;

        await writeContentToLocalFile(handle, editors[editorKey][0].getValue());
        const tab = getFileTabByEditorKey(editorKey);
        if (tab) {
            tab.dataset.path = fullPath;
            tab.dataset.local = 'true';
        }
        if (options.showStatus) {
            appendDebugMessage(`Saved ${fullPath}`);
        }
        return true;
    } catch (error) {
        console.error('Error saving file to local disk:', error);
        appendDebugMessage(`Local save failed (${fullPath}): ${error.message}`);
        return false;
    }
}

function openLocalFsDB() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB is not supported in this browser.'));
            return;
        }

        const request = indexedDB.open(LOCAL_FS_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(LOCAL_FS_DB_STORE)) {
                db.createObjectStore(LOCAL_FS_DB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });
}

async function saveDirectoryHandleToIndexedDB(handle) {
    if (!handle) return;
    const db = await openLocalFsDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_FS_DB_STORE, 'readwrite');
        tx.objectStore(LOCAL_FS_DB_STORE).put(handle, LOCAL_FS_DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to persist directory handle.'));
    });
    db.close();
}

async function getDirectoryHandleFromIndexedDB() {
    const db = await openLocalFsDB();
    const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_FS_DB_STORE, 'readonly');
        const request = tx.objectStore(LOCAL_FS_DB_STORE).get(LOCAL_FS_DB_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Failed to load directory handle.'));
    });
    db.close();
    return handle;
}

async function clearPersistedDirectoryHandle() {
    const db = await openLocalFsDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_FS_DB_STORE, 'readwrite');
        tx.objectStore(LOCAL_FS_DB_STORE).delete(LOCAL_FS_DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to clear directory handle.'));
    });
    db.close();
}

async function restorePersistedLocalFolder() {
    if (!('showDirectoryPicker' in window) || !('indexedDB' in window)) return;

    try {
        const restoredHandle = await getDirectoryHandleFromIndexedDB();
        if (!restoredHandle) return;

        let permission = await restoredHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            permission = await restoredHandle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') return;

        directoryHandle = restoredHandle;
        fileHandles = {};
        directoryHandles = { '': directoryHandle };

        const structure = await scanDirectory(directoryHandle, '');
        fileSystemTree = buildTreeFromStructure(structure);
        deselectFolder();
        updateFileListFromHandles(fileSystemTree);
    } catch (error) {
        console.error('Unable to restore persisted folder handle:', error);
        try {
            await clearPersistedDirectoryHandle();
        } catch (_) {
            // Ignore IndexedDB cleanup failures
        }
    }
}

/*
 * selectFolder:
 * Marks a folder as the current "target" for New File / New Folder actions.
 * Removes the highlight from the previously selected folder (if any).
 */
function selectFolder(folderDiv, childrenDiv, path, id) {
    if (selectedFolderEl) selectedFolderEl.classList.remove('folder-selected');
    selectedFolderEl         = folderDiv;
    selectedFolderChildrenEl = childrenDiv;
    selectedFolderPath       = path;
    selectedFolderId         = id;
    folderDiv.classList.add('folder-selected');
}

/*
 * deselectFolder:
 * Clears the current folder selection (clicking on empty space resets to root).
 */
function deselectFolder() {
    if (selectedFolderEl) selectedFolderEl.classList.remove('folder-selected');
    selectedFolderEl         = null;
    selectedFolderChildrenEl = null;
    selectedFolderPath       = '';
    selectedFolderId         = null;
}

/*
 * getContainerDepth:
 * Returns the numeric nesting depth stored on a container element (data-depth).
 * The root #file container has depth 0.
 */
function getContainerDepth(container) {
    return parseInt(container.dataset.depth || '0');
}

/*
 * createFolder:
 * Appends an inline rename row to #file so the user can type a folder name.
 * On Enter / blur it commits: creates a proper folder row + sibling children div.
 */
function createFolder() {
    // ── Determine insertion context ──────────────────────────────────────────
    const container  = selectedFolderChildrenEl || document.getElementById('file');
    const depth      = getContainerDepth(container);
    const parentPath = selectedFolderPath;
    const parentId   = selectedFolderId;

    // Auto-expand the selected folder so the new item is immediately visible
    if (selectedFolderEl && selectedFolderEl.classList.contains('collapsed')) {
        toggleFolder(selectedFolderEl, selectedFolderChildrenEl);
    }

    // ── Show inline input inside the target container ────────────────────────
    const inputRow = document.createElement('div');
    inputRow.className = 'inline-rename-row';
    inputRow.style.paddingLeft = `${depth * 16}px`;
    inputRow.innerHTML =
        '<span class="folder-chevron"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg></span>' +
        '<span class="item-icon"></span>' +
        '<input class="inline-rename-input" type="text" placeholder="folder name">';
    container.appendChild(inputRow);

    const input = inputRow.querySelector('.inline-rename-input');
    input.focus();

    let committed = false;
    async function commit() {
        if (committed) return;
        committed = true;
        const name = input.value.trim();
        inputRow.remove();
        if (!name) return;

        const folderPath = normalizePath(parentPath ? `${parentPath}/${name}` : name);
        const shouldWriteLocal = directoryHandle && (parentPath === '' || Boolean(directoryHandles[normalizePath(parentPath)]));

        if (shouldWriteLocal) {
            try {
                await ensureDirectoryHandleForPath(folderPath, true);
            } catch (error) {
                console.error('Error creating local folder:', error);
                alert(`Error creating folder on local disk: ${error.message}`);
                return;
            }
        }

        // ── Update the JSON tree ─────────────────────────────────────────────
        const folderId   = ++nodeIdCounter;
        const newNode    = { id: folderId, name, type: 'folder', path: folderPath, children: [] };
        if (parentId !== null) {
            addItemToFolder(fileSystemTree, parentId, newNode);
        } else {
            fileSystemTree.push(newNode);
        }

        // ── Build DOM elements ───────────────────────────────────────────────
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder collapsed';
        folderDiv.style.paddingLeft = `${depth * 16}px`;
        folderDiv.dataset.path     = folderPath;
        folderDiv.dataset.folderId = folderId;
        folderDiv.dataset.local    = shouldWriteLocal ? 'true' : 'false';
        folderDiv.innerHTML = buildFolderRowHTML(name);

        const childrenDiv = document.createElement('div');
        childrenDiv.className    = 'folder-children';
        childrenDiv.dataset.depth = String(depth + 1);

        // Click → toggle + select
        folderDiv.onclick = (e) => {
            e.stopPropagation();
            toggleFolder(folderDiv, childrenDiv);
            selectFolder(folderDiv, childrenDiv, folderPath, folderId);
        };

        container.appendChild(folderDiv);
        container.appendChild(childrenDiv);

        socket.emit('create_new_folder', {
            room: room_id,
            folderId,
            folderName: name,
            parentPath,
            folderPath,
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { committed = true; inputRow.remove(); }
    });
    input.addEventListener('blur', commit);
}

/*
 * startFolderRename:
 * Opens inline rename input inside a folder row and commits on Enter/blur.
 */
function startFolderRename(event) {
    event.preventDefault();
    event.stopPropagation();

    const folderDiv = event.currentTarget.closest('.folder');
    if (!folderDiv) return;

    const folderId = parseInt(folderDiv.dataset.folderId || '', 10);
    if (!Number.isFinite(folderId)) return;

    const currentNameEl = folderDiv.querySelector('.item-name');
    if (!currentNameEl) return;

    const oldName = currentNameEl.textContent.trim();
    const renameInput = document.createElement('input');
    renameInput.className = 'inline-rename-input';
    renameInput.value = oldName;

    currentNameEl.replaceWith(renameInput);
    renameInput.focus();
    renameInput.select();

    let done = false;
    function finalize(shouldCommit) {
        if (done) return;
        done = true;

        const proposed = renameInput.value.trim();
        const restoredNameEl = document.createElement('span');
        restoredNameEl.className = 'item-name';
        restoredNameEl.textContent = oldName;
        renameInput.replaceWith(restoredNameEl);

        if (!shouldCommit || !proposed || proposed === oldName) return;
        renameFolder(folderId, proposed, true);
    }

    renameInput.addEventListener('click', (e) => e.stopPropagation());
    renameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finalize(true);
        if (e.key === 'Escape') finalize(false);
    });
    renameInput.addEventListener('blur', () => finalize(true));
}

/*
 * requestFolderDelete:
 * Confirms then triggers recursive folder deletion.
 */
function requestFolderDelete(event) {
    event.preventDefault();
    event.stopPropagation();

    const folderDiv = event.currentTarget.closest('.folder');
    if (!folderDiv) return;

    const folderId = parseInt(folderDiv.dataset.folderId || '', 10);
    if (!Number.isFinite(folderId)) return;

    const confirmed = confirm('Are you sure you want to delete this folder and all its contents?');
    if (!confirmed) return;

    deleteFolder(folderId, true, folderDiv.dataset.path || '');
}

/*
 * cleanupEditorsInContainer:
 * Removes all editors associated with tab rows inside the given container.
 */
function cleanupEditorsInContainer(container) {
    if (!container) return;
    const tabs = container.querySelectorAll('.tabEditor[id^="file"]');
    tabs.forEach((tab) => {
        const suffix = (tab.id || '').replace('file', '');
        if (!suffix) return;
        const editorId = `editor${suffix}`;
        const editorEl = document.getElementById(editorId);
        if (editorEl) editorEl.remove();
        delete editors[`textEditor${suffix}`];
        if (typeof uploadedFilesByEditorId !== 'undefined') {
            delete uploadedFilesByEditorId[editorId];
        }
    });
}

/*
 * updateFolderDomPaths:
 * Updates dataset.path for a renamed folder and all descendant rows.
 */
function updateFolderDomPaths(folderDiv, oldPath, newPath) {
    folderDiv.dataset.path = newPath;

    const childrenDiv = folderDiv.nextElementSibling;
    if (!childrenDiv || !childrenDiv.classList.contains('folder-children')) return;

    childrenDiv.querySelectorAll('.folder').forEach((childFolder) => {
        const childPath = childFolder.dataset.path || '';
        childFolder.dataset.path = replacePathPrefix(childPath, oldPath, newPath);
    });

    childrenDiv.querySelectorAll('.tabEditor').forEach((fileTab) => {
        const filePath = fileTab.dataset.path || '';
        if (filePath) {
            fileTab.dataset.path = replacePathPrefix(filePath, oldPath, newPath);
        }
    });
}

/*
 * deleteFolder:
 * Recursively deletes the folder and all descendants from UI + JSON tree.
 * Emits delete_folder to backend unless syncBackend is false.
 */
function deleteFolder(folderId, syncBackend = true, folderPathOverride = '') {
    const folderDiv = findFolderDomById(folderId);
    const removedNode = removeFolderFromTree(fileSystemTree, folderId);
    const folderPath = folderPathOverride || (folderDiv ? folderDiv.dataset.path : '') || (removedNode ? removedNode.path : '');

    if (folderDiv) {
        const childrenDiv = folderDiv.nextElementSibling;
        if (childrenDiv && childrenDiv.classList.contains('folder-children')) {
            cleanupEditorsInContainer(childrenDiv);
            childrenDiv.remove();
        }
        folderDiv.remove();
    }

    if (folderPath) {
        removeFileHandlePaths(folderPath);
        removeDirectoryHandlePaths(folderPath);
        if (selectedFolderPath === folderPath || selectedFolderPath.startsWith(`${folderPath}/`)) {
            deselectFolder();
        }
    }

    const remainingTabs = document.querySelectorAll('#file .tabEditor');
    if (remainingTabs.length > 0) {
        remainingTabs[0].click();
    }

    if (syncBackend) {
        socket.emit('delete_folder', {
            room: room_id,
            folderId,
            folderPath,
        });
    }

    return Boolean(folderDiv || removedNode);
}

/*
 * renameFolder:
 * Recursively renames a folder in the JSON tree, updates DOM/path state,
 * and emits rename_folder to backend unless syncBackend is false.
 */
function renameFolder(folderId, newName, syncBackend = true) {
    const cleanName = (newName || '').trim();
    if (!cleanName) return false;

    const folderDiv = findFolderDomById(folderId);
    if (!folderDiv) return false;

    const oldPathFromDom = folderDiv.dataset.path || '';
    const renamed = renameFolderInTree(fileSystemTree, folderId, cleanName);

    const oldPath = renamed ? renamed.oldPath : oldPathFromDom;
    const slashIndex = oldPath.lastIndexOf('/');
    const parentPath = slashIndex === -1 ? '' : oldPath.slice(0, slashIndex);
    const newPath = renamed ? renamed.newPath : (parentPath ? `${parentPath}/${cleanName}` : cleanName);

    const nameEl = folderDiv.querySelector('.item-name');
    if (nameEl) nameEl.textContent = cleanName;
    updateFolderDomPaths(folderDiv, oldPath, newPath);

    if (selectedFolderPath) {
        selectedFolderPath = replacePathPrefix(selectedFolderPath, oldPath, newPath);
    }
    syncFileHandlePathsAfterRename(oldPath, newPath);
    syncDirectoryHandlePathsAfterRename(oldPath, newPath);

    if (syncBackend) {
        socket.emit('rename_folder', {
            room: room_id,
            folderId,
            oldPath,
            newPath,
            newName: cleanName,
        });
    }

    return true;
}

/*
 * popMenu: 
 * Gets the coordinates of the right click and displays the popup menu.
 * Removes popup on clicking on left click.
 */

function popupMenu(event){
    event.preventDefault();  
    currentDivOfFile = event.target.getAttribute('id');
    popup.style.left = `${event.pageX}px`;
    popup.style.top = `${event.pageY}px`;
    popup.style.display = 'block';
}

document.addEventListener('click', () => {
    popup.style.display = 'none';
});

/*
 * toggleTab:
 * Switches sidebar panel between file and users.
 * Clicking the same tab retracts/expands the sidebar panel.
 */

function toggleTab(tabId, event) {
    const ioAreaDiv = document.getElementById('ioAreaDiv');
    const mainPane = document.getElementById('mainPane');
    const tabs = document.querySelectorAll('#sidebar .tab');
    const contents = document.querySelectorAll('#ioAreaDiv .content');

    if (activeTab === tabId) {
        isRetracted = !isRetracted;
        if (isRetracted) {
            ioAreaDiv.classList.add('retracted');
            mainPane.style.flexGrow = '100';
        } else {
            ioAreaDiv.classList.remove('retracted');
            mainPane.style.flexGrow = '1';
        }
        return;
    }

    isRetracted = false;
    ioAreaDiv.classList.remove('retracted');
    mainPane.style.flexGrow = '1';

    contents.forEach(content => content.classList.add('hidden'));
    tabs.forEach(tab => tab.classList.remove('active'));

    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.remove('hidden');
    if (event && event.target) {
        const clickedTab = event.target.closest('.tab');
        if (clickedTab) clickedTab.classList.add('active');
    }

    activeTab = tabId;
}

/*
 * refreshTerminalEditors:
 * Refreshes terminal CodeMirror instances after resize/tab/collapse changes.
 */
function refreshTerminalEditors() {
    if (inputArea && typeof inputArea.refresh === 'function') inputArea.refresh();
    if (outputArea && typeof outputArea.refresh === 'function') outputArea.refresh();
}

/*
 * switchTerminalTab:
 * Activates one of the bottom terminal tabs: terminal | output | debug.
 */
function switchTerminalTab(tabName) {
    const tabMap = {
        terminal: { btn: 'terminalTabTerminal', pane: 'terminalContentTerminal' },
        output: { btn: 'terminalTabOutput', pane: 'terminalContentOutput' },
        debug: { btn: 'terminalTabDebug', pane: 'terminalContentDebug' },
    };

    Object.values(tabMap).forEach(({ btn, pane }) => {
        const btnEl = document.getElementById(btn);
        const paneEl = document.getElementById(pane);
        if (btnEl) btnEl.classList.remove('active');
        if (paneEl) paneEl.classList.remove('active');
    });

    const selected = tabMap[tabName] || tabMap.output;
    const btnEl = document.getElementById(selected.btn);
    const paneEl = document.getElementById(selected.pane);
    if (btnEl) btnEl.classList.add('active');
    if (paneEl) paneEl.classList.add('active');

    refreshTerminalEditors();
}

/*
 * toggleBottomTerminal:
 * Collapses/expands the bottom terminal. forceOpen=true always expands.
 */
function toggleBottomTerminal(forceOpen = false) {
    const terminal = document.getElementById('bottomTerminal');
    const minimizeBtn = document.getElementById('terminalMinimizeBtn');
    if (!terminal) return;

    const shouldOpen = forceOpen === true || terminal.classList.contains('collapsed');
    if (shouldOpen) {
        terminal.classList.remove('collapsed');
        terminal.style.height = `${terminalHeight}px`;
        if (minimizeBtn) minimizeBtn.textContent = '▾';
        refreshTerminalEditors();
        return;
    }

    terminalHeight = Math.max(terminal.offsetHeight, TERMINAL_MIN_HEIGHT);
    terminal.classList.add('collapsed');
    if (minimizeBtn) minimizeBtn.textContent = '▸';
}

/*
 * openBottomTerminal:
 * Opens terminal from sidebar shortcut and focuses the Output tab.
 */
function openBottomTerminal(event) {
    if (event) event.preventDefault();
    toggleBottomTerminal(true);
    switchTerminalTab('output');
}

/*
 * initTerminalResize:
 * Enables drag-to-resize behavior for the bottom terminal panel.
 */
function initTerminalResize() {
    const handle = document.getElementById('terminalResizeHandle');
    const terminal = document.getElementById('bottomTerminal');
    const mainPane = document.getElementById('mainPane');
    if (!handle || !terminal || !mainPane) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (event) => {
        if (terminal.classList.contains('collapsed')) return;
        isResizing = true;
        startY = event.clientY;
        startHeight = terminal.offsetHeight;
        document.body.classList.add('terminal-resizing');
        event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
        if (!isResizing) return;

        const deltaY = startY - event.clientY;
        const maxAllowed = Math.max(TERMINAL_MIN_HEIGHT, mainPane.clientHeight - 120);
        const nextHeight = Math.max(TERMINAL_MIN_HEIGHT, Math.min(startHeight + deltaY, maxAllowed));

        terminalHeight = nextHeight;
        terminal.style.height = `${nextHeight}px`;
        refreshTerminalEditors();
    });

    window.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.classList.remove('terminal-resizing');
    });

    window.addEventListener('resize', () => {
        if (terminal.classList.contains('collapsed')) return;
        const maxAllowed = Math.max(TERMINAL_MIN_HEIGHT, mainPane.clientHeight - 120);
        terminalHeight = Math.min(terminalHeight, maxAllowed);
        terminal.style.height = `${terminalHeight}px`;
        refreshTerminalEditors();
    });
}

/*
 * setAIThinking:
 * Toggles loading state for AI generation UI.
 */
function setAIThinking(isThinking) {
    aiGenInProgress = isThinking;

    const statusEl = document.getElementById('aiGenStatus');
    const buttonEl = document.getElementById('aiGenBtn');
    const fixBtn = document.getElementById('aiFixBtn');

    if (statusEl) statusEl.classList.toggle('visible', isThinking);
    if (buttonEl) buttonEl.disabled = isThinking;
    if (fixBtn) fixBtn.disabled = isThinking;
}

/*
 * stripCodeFence:
 * Removes accidental markdown code fences from model output.
 */
function stripCodeFence(text) {
    const raw = (text || '').trim();
    if (!raw.startsWith('```')) return raw;

    const lines = raw.split('\n');
    if (lines.length && lines[0].trim().startsWith('```')) lines.shift();
    if (lines.length && lines[lines.length - 1].trim().startsWith('```')) lines.pop();
    return lines.join('\n').trim();
}

/*
 * formatAIError:
 * Extracts human-readable error text from backend error payload.
 */
function formatAIError(data) {
    const base = (data && data.error) ? data.error : 'AI generation failed';
    if (!data || !data.details) return base;

    let detailText = '';
    if (typeof data.details === 'string') {
        try {
            const parsed = JSON.parse(data.details);
            detailText = parsed?.error?.message || parsed?.message || data.details;
        } catch {
            detailText = data.details;
        }
    } else {
        detailText = data.details?.error?.message || data.details?.message || JSON.stringify(data.details);
    }

    const compact = String(detailText).replace(/\s+/g, ' ').trim();
    if (!compact) return base;

    return `${base}: ${compact}`;
}

/*
 * isLikelyCommentLine:
 * Checks whether current line appears to be a comment instruction.
 */
function isLikelyCommentLine(lineText = '') {
    const trimmed = lineText.trim();
    return (
        trimmed.startsWith('#') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('--') ||
        trimmed.startsWith('<!--')
    );
}

/*
 * buildAIPayloadFromEditor:
 * Collects prompt + nearby context around cursor for generation.
 */
function buildAIPayloadFromEditor() {
    const doc = currentTextEditor.getDoc();
    const cursor = doc.getCursor();

    const selected = doc.getSelection();
    const lineText = doc.getLine(cursor.line) || '';
    const lineTrimmed = lineText.trim();

    const startLine = Math.max(0, cursor.line - 30);
    const endLine = Math.min(doc.lineCount() - 1, cursor.line + 30);
    const contextLines = [];
    for (let lineNo = startLine; lineNo <= endLine; lineNo++) {
        contextLines.push(doc.getLine(lineNo));
    }

    let prompt = (selected || '').trim();
    if (!prompt) {
        prompt = lineTrimmed;
    }
    if (!prompt) {
        prompt = 'Generate code for the current cursor location.';
    }

    const mode = isLikelyCommentLine(lineText) ? 'comment' : 'line';

    return {
        prompt,
        context: contextLines.join('\n'),
        language: fileExtension || 'plain',
        mode,
    };
}

/*
 * insertGeneratedCodeAtCursor:
 * Inserts model output at the current cursor position.
 */
function insertGeneratedCodeAtCursor(codeSnippet) {
    const doc = currentTextEditor.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(codeSnippet, cursor);
    currentTextEditor.focus();
}

/*
 * escapeHtml:
 * Escapes text to safely render code in diff table cells.
 */
function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/*
 * splitDiffLines:
 * Splits diff chunks into display lines while removing trailing empty artifact line.
 */
function splitDiffLines(value = '') {
    const lines = String(value).replace(/\r/g, '').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}

/*
 * buildFixDiffRows:
 * Builds side-by-side diff rows with added/removed/changed highlighting.
 */
function buildFixDiffRows(originalCode, correctedCode) {
    const rows = [];
    let oldLineNo = 1;
    let newLineNo = 1;

    const hasDiffLib = window.Diff && typeof window.Diff.diffLines === 'function';
    if (!hasDiffLib) {
        const left = String(originalCode || '').split('\n');
        const right = String(correctedCode || '').split('\n');
        const count = Math.max(left.length, right.length);
        for (let i = 0; i < count; i++) {
            const l = left[i] ?? '';
            const r = right[i] ?? '';
            const type = l === r ? 'unchanged' : 'changed';
            rows.push({
                type,
                oldNo: i < left.length ? oldLineNo++ : '',
                oldText: l,
                newNo: i < right.length ? newLineNo++ : '',
                newText: r,
            });
        }
        return rows;
    }

    const parts = window.Diff.diffLines(originalCode || '', correctedCode || '');
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part.removed && i + 1 < parts.length && parts[i + 1].added) {
            const removedLines = splitDiffLines(part.value);
            const addedLines = splitDiffLines(parts[i + 1].value);
            const rowCount = Math.max(removedLines.length, addedLines.length);

            for (let row = 0; row < rowCount; row++) {
                rows.push({
                    type: 'changed',
                    oldNo: row < removedLines.length ? oldLineNo++ : '',
                    oldText: row < removedLines.length ? removedLines[row] : '',
                    newNo: row < addedLines.length ? newLineNo++ : '',
                    newText: row < addedLines.length ? addedLines[row] : '',
                });
            }

            i++;
            continue;
        }

        const lines = splitDiffLines(part.value);
        if (part.removed) {
            lines.forEach((line) => {
                rows.push({
                    type: 'removed',
                    oldNo: oldLineNo++,
                    oldText: line,
                    newNo: '',
                    newText: '',
                });
            });
        } else if (part.added) {
            lines.forEach((line) => {
                rows.push({
                    type: 'added',
                    oldNo: '',
                    oldText: '',
                    newNo: newLineNo++,
                    newText: line,
                });
            });
        } else {
            lines.forEach((line) => {
                rows.push({
                    type: 'unchanged',
                    oldNo: oldLineNo++,
                    oldText: line,
                    newNo: newLineNo++,
                    newText: line,
                });
            });
        }
    }

    return rows;
}

/*
 * renderCodeFixDiff:
 * Renders side-by-side diff table inside modal.
 */
function renderCodeFixDiff(originalCode, correctedCode) {
    const container = document.getElementById('fixDiffContainer');
    if (!container) return;

    const rows = buildFixDiffRows(originalCode, correctedCode);
    if (!rows.length) {
        container.innerHTML = '<div class="fix-empty">No diff available.</div>';
        return;
    }

    const rowsHtml = rows.map((row) => `
        <tr class="fix-row-${row.type}">
            <td class="fix-line-no fix-line-left">${row.oldNo}</td>
            <td class="fix-code-cell fix-code-left">${escapeHtml(row.oldText)}</td>
            <td class="fix-line-no fix-line-right">${row.newNo}</td>
            <td class="fix-code-cell fix-code-right">${escapeHtml(row.newText)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="fix-diff-table">
            <thead>
                <tr>
                    <th colspan="2">Original</th>
                    <th colspan="2">Corrected</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

/*
 * openCodeFixModal:
 * Opens diff preview modal with generated fix.
 */
function openCodeFixModal(originalCode, correctedCode) {
    pendingOriginalCode = originalCode;
    pendingFixCode = correctedCode;
    renderCodeFixDiff(originalCode, correctedCode);

    const modal = document.getElementById('codeFixModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fix-modal-open');
}

/*
 * closeCodeFixModal:
 * Closes diff modal without applying changes.
 */
function closeCodeFixModal() {
    const modal = document.getElementById('codeFixModal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('fix-modal-open');
    pendingOriginalCode = null;
    pendingFixCode = null;
}

/*
 * acceptAIFixChanges:
 * Applies corrected code to active editor.
 */
function acceptAIFixChanges() {
    if (!currentTextEditor || pendingFixCode === null) {
        closeCodeFixModal();
        return;
    }

    currentTextEditor.setValue(pendingFixCode);
    currentTextEditor.focus();
    appendDebugMessage('AI fix accepted and applied');
    outputArea.setValue(pendingFixCode);
    refreshTerminalEditors();

    closeCodeFixModal();
}

/*
 * triggerAIFix:
 * Sends full editor code to /api/fix-code and opens diff preview.
 */
async function triggerAIFix() {
    if (aiGenInProgress || !currentTextEditor) return;

    const currentCode = currentTextEditor.getValue();
    if (!currentCode.trim()) {
        appendDebugMessage('AI code fix skipped: editor is empty');
        return;
    }

    toggleBottomTerminal(true);
    switchTerminalTab('output');
    setAIThinking(true);
    outputArea.setValue('AI is thinking...');
    appendDebugMessage(`AI code fix requested (${fileExtension})`);

    try {
        const response = await fetch('/api/fix-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: currentCode, language: fileExtension || 'plain' }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatAIError(data));
        }

        const originalCode = typeof data.originalCode === 'string' ? data.originalCode : currentCode;
        const correctedCode = stripCodeFence(data.correctedCode || '');
        if (!correctedCode) {
            throw new Error('AI returned empty fixed code');
        }

        openCodeFixModal(originalCode, correctedCode);
        outputArea.setValue('AI fix ready. Review diff and click Accept Changes.');
        const modelUsed = data.model ? ` (${data.model})` : '';
        appendDebugMessage(`AI code fix generated${modelUsed}`);
    } catch (error) {
        const message = `AI code fix failed: ${error.message}`;
        outputArea.setValue(message);
        appendDebugMessage(message);
        switchTerminalTab('debug');
    } finally {
        setAIThinking(false);
        refreshTerminalEditors();
    }
}

/*
 * initCodeFixModalShortcuts:
 * Allows Escape key to close fix modal quickly.
 */
function initCodeFixModalShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const modal = document.getElementById('codeFixModal');
        if (modal && modal.classList.contains('open')) {
            closeCodeFixModal();
        }
    });
}

/*
 * triggerAIGen:
 * Sends current line/comment context to backend and inserts generated code.
 */
async function triggerAIGen() {
    if (aiGenInProgress || !currentTextEditor) return;

    const payload = buildAIPayloadFromEditor();
    if (!payload.prompt && !payload.context) return;

    toggleBottomTerminal(true);
    switchTerminalTab('output');
    setAIThinking(true);
    outputArea.setValue('AI is thinking...');
    appendDebugMessage(`AI generation requested (${payload.mode}, ${payload.language})`);

    try {
        const response = await fetch('/api/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatAIError(data));
        }

        const generatedCode = stripCodeFence(data.code || '');
        if (!generatedCode) {
            throw new Error('AI returned empty code');
        }

        insertGeneratedCodeAtCursor(generatedCode);
        outputArea.setValue(generatedCode);
        const modelUsed = data.model ? ` (${data.model})` : '';
        appendDebugMessage(`AI code inserted at cursor${modelUsed}`);
        refreshTerminalEditors();
    } catch (error) {
        const message = `AI generation failed: ${error.message}`;
        outputArea.setValue(message);
        appendDebugMessage(message);
        switchTerminalTab('debug');
    } finally {
        setAIThinking(false);
    }
}

/*
 * initAIGenShortcut:
 * Binds Ctrl+Space / Cmd+Space to AI generation.
 */
function initAIGenShortcut() {
    document.addEventListener('keydown', (event) => {
        const isShortcut = (event.ctrlKey || event.metaKey) && event.code === 'Space';
        if (!isShortcut) return;
        event.preventDefault();
        triggerAIGen();
    });
}

function initLocalSaveShortcut() {
    document.addEventListener('keydown', (event) => {
        const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
        if (!isSaveShortcut) return;

        event.preventDefault();
        if (!currentTextEditorName) return;
        saveEditorToLocalDisk(currentTextEditorName, { createIfMissing: true, showStatus: true });
    });
}

/*
 * toggleEditor:
 * To switch between editors. 
 */

function toggleEditor(editorId) {
    // Show the matching editor pane, hide all others
    document.querySelectorAll('#textAreaDiv > div').forEach(editor => {
        editor.style.display = editor.id === editorId ? 'block' : 'none';
    });

    // Find the tab for this editor and make it the sole active item
    const tab = document.querySelector(`#file .tabEditor[onclick*="${editorId}"]`);
    setActiveTab(tab);

    // Read the clean filename from data-filename (not textContent — avoids icon text)
    if (tab) {
        const fname = tab.getAttribute('data-filename') || '';
        fileExtension = fname.includes('.') ? fname.split('.').pop() : 'plain';
    }

    currentTextEditor = editors[`textEditor${editorId.split('r').pop()}`][0];
    currentTextEditorName = `textEditor${editorId.split('r').pop()}`;
    if (userCursors.length > 0) {
        const oldWidget = userCursors.splice(0, 1)[0];
        oldWidget.remove();
    }
    currentTextEditor.setCursor({ line: 0, ch: 0 });
}

/*
 * isFileNameUnique:
 * Returns if the filename entered is unique in editors dictionary.
 */

function isFileNameUnique(fileName) {
    for (const key in editors) {
        if (editors[key][1] === fileName) {
            return false; 
        }
    }
    return true;
}

/*
 * createFile:
 * Checks if the filename entered is unique in editors dictionary.
 * Creates dynamic div inside file tab with the filename given by user.
 * Creates dynamic editor inside textAreaDiv for each file. 
 * Initializes code mirror objects based on file extention provided by user.
 * Initializes socket.on change for updating each keystroke made in editor.
 * Socket.emit to create_new_file to pass room_id ,fileCount and fileName to backend. 
 */

function createFile() {
    // ── Determine insertion context ──────────────────────────────────────────
    const container  = selectedFolderChildrenEl || document.getElementById('file');
    const depth      = getContainerDepth(container);
    const parentPath = selectedFolderPath;

    // Auto-expand the selected folder so the new item is immediately visible
    if (selectedFolderEl && selectedFolderEl.classList.contains('collapsed')) {
        toggleFolder(selectedFolderEl, selectedFolderChildrenEl);
    }

    // ── Show inline input inside the target container ────────────────────────
    const inputRow = document.createElement('div');
    inputRow.className = 'inline-rename-row';
    inputRow.style.paddingLeft = `${8 + depth * 16}px`;
    inputRow.innerHTML = '<span class="item-icon"></span><input class="inline-rename-input" type="text" placeholder="file name (e.g. app.py)">';
    container.appendChild(inputRow);

    const input = inputRow.querySelector('.inline-rename-input');
    input.focus();

    let committed = false;
    async function commit() {
        if (committed) return;
        committed = true;
        const fileName = input.value.trim();
        inputRow.remove();
        if (!fileName) return;

        if (!isFileNameUnique(fileName)) {
            alert('Filename already exists. Please choose a different name.');
            return;
        }

        const fullPath = normalizePath(parentPath ? `${parentPath}/${fileName}` : fileName);
        const shouldWriteLocal = directoryHandle && (parentPath === '' || Boolean(directoryHandles[normalizePath(parentPath)]));

        if (shouldWriteLocal) {
            try {
                const localHandle = await ensureFileHandleForPath(fullPath, true);
                if (localHandle) {
                    await writeContentToLocalFile(localHandle, '');
                }
            } catch (error) {
                console.error('Error creating local file:', error);
                alert(`Error creating file on local disk: ${error.message}`);
                return;
            }
        }

        // ── Update the JSON tree ─────────────────────────────────────────────
        const fileNodeId = ++nodeIdCounter;
        const newNode    = { id: fileNodeId, name: fileName, type: 'file', path: fullPath, parentId: selectedFolderId };
        if (selectedFolderId !== null) {
            addItemToFolder(fileSystemTree, selectedFolderId, newNode);
        } else {
            fileSystemTree.push(newNode);
        }

        // ── Build tab DOM element ────────────────────────────────────────────
        fileCount++;
        const newEditorId = `editor${fileCount}`;
        const newTab = document.createElement('div');
        newTab.id = `file${fileCount}`;
        newTab.className = 'tabEditor';
        newTab.style.paddingLeft = `${8 + depth * 16}px`;
        newTab.dataset.path = fullPath;
        newTab.dataset.local = shouldWriteLocal ? 'true' : 'false';
        newTab.dataset.nodeId = String(fileNodeId);
        newTab.setAttribute('onclick', `toggleEditor('${newEditorId}')`);
        newTab.setAttribute('oncontextmenu', 'popupMenu(event)');
        setTabLabel(newTab, fileName);
        container.appendChild(newTab);

        // ── Build editor DOM element ─────────────────────────────────────────
        const textAreaDiv = document.getElementById('textAreaDiv');
        const newEditor   = document.createElement('div');
        const newTextArea = document.createElement('textarea');
        newEditor.id          = newEditorId;
        newTextArea.id        = `textEditor${fileCount}`;
        newTextArea.rows      = 100;
        newTextArea.cols      = 100;
        newEditor.appendChild(newTextArea);
        textAreaDiv.appendChild(newEditor);

        let syntaxSelector = { cpp: 'text/x-c++src', py: 'python', plain: 'text/plain' };
        let ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'plain';
        if (!(ext in syntaxSelector)) ext = 'plain';

        let ed = [];
        ed.push(CodeMirror.fromTextArea(document.getElementById(`textEditor${fileCount}`), {
            mode: syntaxSelector[ext],
            lineNumbers: true,
            theme: 'material-darker',
            autoCloseBrackets: true,
            matchBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            smartIndent: true,
            indentWithTabs: false,
        }));
        ed.push(fileName);
        ed.push(ed[0].on('change', () => {
            if (isProgrammaticChange) return;
            const text   = currentTextEditor.getValue();
            const cursor = currentTextEditor.getCursor();
            socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
            scheduleLocalAutoSave(currentTextEditorName);
        }));

        editors[`textEditor${fileCount}`] = ed;

        // parentPath is sent so the backend knows the physical directory
        socket.emit('create_new_file', {
            room: room_id,
            fileCount,
            fileName,
            parentPath,
            fullPath,
        });
        toggleEditor(newEditorId);
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { committed = true; inputRow.remove(); }
    });
    input.addEventListener('blur', commit);
}

/*
 * openLocalFolder:
 * Uses the modern File System Access API to open a local folder with read/write permissions.
 * Recursively scans the directory and stores handles for later access.
 * Updates the sidebar with the folder structure.
 */

async function openLocalFolder() {
    try {
        // Check if the API is supported
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.');
            return;
        }

        // Request directory with read/write permissions
        directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

        // Clear existing file handles
        fileHandles = {};
        directoryHandles = { '': directoryHandle };

        // Recursively scan the directory
        const structure = await scanDirectory(directoryHandle, '');
        fileSystemTree = buildTreeFromStructure(structure);
        deselectFolder();

        console.log('Opened folder structure:', structure);

        // Update the sidebar
        updateFileListFromHandles(fileSystemTree);
        try {
            await saveDirectoryHandleToIndexedDB(directoryHandle);
        } catch (persistError) {
            console.warn('Unable to persist selected folder handle:', persistError);
        }

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error opening folder:', error);
            alert('Error opening folder: ' + error.message);
        }
    }
}

/*
 * scanDirectory:
 * Recursively scans a directory handle to build the file structure.
 * Stores file handles in the global fileHandles object.
 */

async function scanDirectory(dirHandle, path) {
    const structure = [];
    const currentPath = normalizePath(path);
    directoryHandles[currentPath] = dirHandle;

    for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = normalizePath(path ? `${path}/${name}` : name);
        
        if (handle.kind === 'file') {
            // Store file handle
            fileHandles[fullPath] = handle;
            
            structure.push({
                name: name,
                path: fullPath,
                type: 'file'
            });
        } else if (handle.kind === 'directory') {
            // Recursively scan subdirectory
            const children = await scanDirectory(handle, fullPath);
            
            structure.push({
                name: name,
                path: fullPath,
                type: 'folder',
                children: children
            });
        }
    }

    return structure;
}

/*
 * buildTreeFromStructure:
 * Converts scanned structure into the app's recursive JSON tree with ids.
 */
function buildTreeFromStructure(structure, parentId = null) {
    return (structure || []).map((item) => {
        const nodeId = ++nodeIdCounter;
        if (item.type === 'folder') {
            const children = buildTreeFromStructure(item.children || [], nodeId);
            return {
                id: nodeId,
                name: item.name,
                type: 'folder',
                path: item.path,
                parentId,
                children,
            };
        }

        return {
            id: nodeId,
            name: item.name,
            type: 'file',
            path: item.path,
            parentId,
        };
    });
}

/*
 * updateFileListFromHandles:
 * Updates the file list in the sidebar based on the scanned directory structure.
 */

function updateFileListFromHandles(structure, parentElement = document.getElementById('file'), indent = 0) {
    // Clear existing file list (keep the file-box)
    const fileBox = document.getElementById('file-box');
    const existingFiles = parentElement.querySelectorAll('.tabEditor, .folder, .folder-children');
    existingFiles.forEach(el => el.remove());

    // Add the new structure
    structure.forEach(item => {
        if (item.type === 'file') {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'tabEditor';
            fileDiv.style.paddingLeft = `${8 + indent * 16}px`;
            fileDiv.dataset.path = item.path;
            fileDiv.dataset.local = 'true';
            setTabLabel(fileDiv, item.name);
            fileDiv.onclick = (e) => { e.stopPropagation(); openFileFromHandle(item.path); };
            fileDiv.oncontextmenu = (event) => popupMenu(event);
            parentElement.appendChild(fileDiv);
        } else if (item.type === 'folder') {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder collapsed';
            folderDiv.style.paddingLeft = `${indent * 16}px`;
            folderDiv.dataset.path     = item.path;
            folderDiv.dataset.folderId = String(item.id);
            folderDiv.dataset.local = 'true';
            folderDiv.innerHTML = buildFolderRowHTML(item.name);

            const childrenDiv = document.createElement('div');
            childrenDiv.className      = 'folder-children';
            childrenDiv.dataset.depth  = String(indent + 1);

            // Toggle expand AND mark as selected folder for New File/Folder context
            folderDiv.onclick = (e) => {
                e.stopPropagation();
                toggleFolder(folderDiv, childrenDiv);
                selectFolder(folderDiv, childrenDiv, item.path, item.id);
            };

            parentElement.appendChild(folderDiv);
            parentElement.appendChild(childrenDiv);

            if (item.children) {
                updateFileListFromHandles(item.children, childrenDiv, indent + 1);
            }
        }
    });
}

/*
 * openFileFromHandle:
 * Opens a file from the stored handle using FileReader.
 */

async function openFileFromHandle(path) {
    try {
        const normalizedPath = normalizePath(path);
        const handle = fileHandles[normalizedPath];
        if (!handle) {
            alert('File handle not found');
            return;
        }

        const file = await handle.getFile();
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            createFileFromContent(handle.name, content, normalizedPath);
        };
        reader.readAsText(file);
    } catch (error) {
        console.error('Error opening file:', error);
        alert('Error opening file: ' + error.message);
    }
}

/*
 * createFileFromContent:
 * Creates a new file editor with the given content.
 */

function createFileFromContent(fileName, content, fullPath = '') {
    if (!isFileNameUnique(fileName)) {
        alert("Filename already exists. Please choose a different name.");
        return;
    }

    fileCount++;
    const newEditorId = `editor${fileCount}`;
    const fileDiv = document.getElementById('file');
    const newTab = document.createElement('div');

    newTab.id = `file${fileCount}`;
    newTab.className = "tabEditor";
    newTab.setAttribute('onclick', `toggleEditor('${newEditorId}')`);
    newTab.setAttribute('oncontextmenu', `popupMenu(event)`);
    newTab.dataset.path = normalizePath(fullPath || fileName);
    newTab.dataset.local = fullPath ? 'true' : 'false';
    setTabLabel(newTab, fileName);
    fileDiv.appendChild(newTab);

    const textAreaDiv = document.getElementById('textAreaDiv');
    const newEditor = document.createElement('div');
    const newTextArea = document.createElement('textarea');

    newEditor.id = newEditorId;
    newTextArea.id = `textEditor${fileCount}`;
    newTextArea.rows = 100;
    newTextArea.cols = 100;
    newTextArea.value = content;
    newEditor.appendChild(newTextArea);
    textAreaDiv.appendChild(newEditor);

    let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain' }
    let fileExtension = fileName.split('.').pop();
    if (!(fileExtension in syntaxSelector)){
        fileExtension = 'plain';
    }   

    let editor = [];
    editor.push (CodeMirror.fromTextArea(document.getElementById(`textEditor${fileCount}`), {
                    mode: syntaxSelector[fileExtension],
                    lineNumbers: true,
                    theme: "material-darker",
                    autoCloseBrackets: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    tabSize: 4,
                    smartIndent: true,
                    indentWithTabs: false,
                }));

    editor.push(fileName);
    editor.push(editor[0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            }));

    editors[`textEditor${fileCount}`] = editor;
    socket.emit('create_new_file', {'room':room_id,'fileCount': fileCount, 'fileName': fileName});
    toggleEditor(newEditorId);
}

/*
 * handleFolderUpload:
 * Handles the upload of a folder, parses the file structure, and updates the sidebar.
 */

function handleFolderUpload(event) {
    const files = event.target.files;
    const fileStructure = {};

    // Build the file structure
    for (let file of files) {
        const path = file.webkitRelativePath;
        const parts = path.split('/');
        let current = fileStructure;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = file;
    }

    console.log('Uploaded folder structure:', fileStructure);

    // Update the sidebar
    updateFileList(fileStructure);
}

/*
 * updateFileList:
 * Updates the file list in the sidebar to display folders and files.
 */

function updateFileList(structure, parentElement = document.getElementById('file'), indent = 0, parentPath = '') {
    for (const [name, item] of Object.entries(structure)) {
        if (item instanceof File) {
            // It's a file
            const filePath = parentPath ? `${parentPath}/${name}` : name;
            const fileDiv = document.createElement('div');
            fileDiv.className = 'tabEditor';
            fileDiv.style.paddingLeft = `${8 + indent * 16}px`;
            fileDiv.dataset.path = filePath;
            setTabLabel(fileDiv, name);
            fileDiv.onclick = () => openUploadedFile(item);
            fileDiv.oncontextmenu = (event) => popupMenu(event);
            parentElement.appendChild(fileDiv);
        } else {
            // It's a folder
            const folderId   = ++nodeIdCounter;
            const folderPath = parentPath ? `${parentPath}/${name}` : name;

            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder collapsed';
            folderDiv.style.paddingLeft = `${indent * 16}px`;
            folderDiv.dataset.path     = folderPath;
            folderDiv.dataset.folderId = folderId;
            folderDiv.innerHTML = buildFolderRowHTML(name);

            const childrenDiv = document.createElement('div');
            childrenDiv.className     = 'folder-children';
            childrenDiv.dataset.depth = String(indent + 1);

            // Toggle expand AND mark as selected folder for New File/Folder context
            folderDiv.onclick = (e) => {
                e.stopPropagation();
                toggleFolder(folderDiv, childrenDiv);
                selectFolder(folderDiv, childrenDiv, folderPath, folderId);
            };

            parentElement.appendChild(folderDiv);
            parentElement.appendChild(childrenDiv);

            updateFileList(item, childrenDiv, indent + 1, folderPath);
        }
    }
}

/*
 * toggleFolder:
 * Toggles the visibility of folder contents.
 */

function toggleFolder(folderDiv, childrenDiv) {
    if (folderDiv.classList.contains('collapsed')) {
        folderDiv.classList.remove('collapsed');
        folderDiv.classList.add('expanded');
        if (childrenDiv) childrenDiv.classList.add('open');
    } else {
        folderDiv.classList.remove('expanded');
        folderDiv.classList.add('collapsed');
        if (childrenDiv) childrenDiv.classList.remove('open');
    }
}

/*
 * openUploadedFile:
 * Opens an uploaded file in the editor.
 */

function openUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        // Create a new file with the content
        createFileFromUpload(file.name, content);
    };
    reader.readAsText(file);
}

/*
 * createFileFromUpload:
 * Creates a new file editor with the uploaded content.
 */

function createFileFromUpload(fileName, content) {
    if (!isFileNameUnique(fileName)) {
        alert("Filename already exists. Please choose a different name.");
        return;
    }

    fileCount++;
    const newEditorId = `editor${fileCount}`;
    const fileDiv = document.getElementById('file');
    const newTab = document.createElement('div');

    newTab.id = `file${fileCount}`;
    newTab.className = "tabEditor";
    newTab.setAttribute('onclick', `toggleEditor('${newEditorId}')`);
    newTab.setAttribute('oncontextmenu', `popupMenu(event)`);
    setTabLabel(newTab, fileName);
    fileDiv.appendChild(newTab);

    const textAreaDiv = document.getElementById('textAreaDiv');
    const newEditor = document.createElement('div');
    const newTextArea = document.createElement('textarea');

    newEditor.id = newEditorId;
    newTextArea.id = `textEditor${fileCount}`;
    newTextArea.rows = 100;
    newTextArea.cols = 100;
    newTextArea.value = content; // Set the content
    newEditor.appendChild(newTextArea);
    textAreaDiv.appendChild(newEditor);

    let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain' }
    let fileExtension = fileName.split('.').pop();
    if (!(fileExtension in syntaxSelector)){
        fileExtension = 'plain';
    }   

    let editor = [];
    editor.push (CodeMirror.fromTextArea(document.getElementById(`textEditor${fileCount}`), {
                    mode: syntaxSelector[fileExtension],
                    lineNumbers: true,
                    theme: "material-darker",
                    autoCloseBrackets: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    tabSize: 4,
                    smartIndent: true,
                    indentWithTabs: false,
                }));

    editor.push(fileName);
    editor.push(editor[0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            }));

    editors[`textEditor${fileCount}`] = editor;
    socket.emit('create_new_file', {'room':room_id,'fileCount': fileCount, 'fileName': fileName});
    toggleEditor(newEditorId);
}

/*
 * createFileByRequest:
 * Creates dynamic div inside file tab with the filename given by user.
 * Creates dynamic editor inside textAreaDiv for each file. 
 * Initializes code mirror objects based on file extention provided by user.
 * Initializes socket.on change for updating each keystroke made in editor.
 */

function createFileByRequest(textEditorid, content, fileName, parentPath = '', fullPath = '') {

    let tempCount = textEditorid.split('r').pop()
    const newEditorId = `editor${tempCount}`;
    const { container, depth } = getContainerByFolderPath(parentPath);
    const resolvedPath = normalizePath(fullPath || (parentPath ? `${parentPath}/${fileName}` : fileName));
    const newTab = document.createElement('div');

    newTab.id = `file${tempCount}`;
    newTab.className = "tabEditor";
    newTab.style.paddingLeft = `${8 + depth * 16}px`;
    newTab.dataset.path = resolvedPath;
    newTab.dataset.local = fileHandles[resolvedPath] ? 'true' : 'false';
    newTab.setAttribute('onclick', `toggleEditor('${newEditorId}')`);
    newTab.setAttribute('oncontextmenu', `popupMenu(event)`);
    setTabLabel(newTab, fileName);
    container.appendChild(newTab);

    if (!isPathInTree(fileSystemTree, resolvedPath)) {
        const nodeId = ++nodeIdCounter;
        const parentId = parentPath ? findFolderIdByPath(fileSystemTree, parentPath) : null;
        const fileNode = { id: nodeId, name: fileName, type: 'file', path: resolvedPath, parentId };
        if (parentId !== null) {
            addItemToFolder(fileSystemTree, parentId, fileNode);
        } else {
            fileSystemTree.push(fileNode);
        }
    }

    const textAreaDiv = document.getElementById('textAreaDiv');
    const newEditor = document.createElement('div');
    const newTextArea = document.createElement('textarea');

    newEditor.id = newEditorId;
    newTextArea.id = `textEditor${tempCount}`;
    newTextArea.rows = 100;
    newTextArea.cols = 100;
    newEditor.appendChild(newTextArea);
    textAreaDiv.appendChild(newEditor);

    let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain' }
    let fileExtension = fileName.split('.').pop();
    if (!(fileExtension in syntaxSelector)){
        fileExtension = 'plain';
    }   

    let editor = [];
    editor.push (CodeMirror.fromTextArea(document.getElementById(`textEditor${tempCount}`), {
                    mode: syntaxSelector[fileExtension],
                    lineNumbers: true,
                    theme: "material-darker",
                    autoCloseBrackets: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    tabSize: 4,
                    smartIndent: true,
                    indentWithTabs: false,
                }));

    editor.push(fileName);
    editor[0].setValue(content);
    editor.push(editor[0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            }));
    
    editors[`textEditor${tempCount}`] = editor;
}

/*
 * deleteFile:
 * Alerts the user for confirmation to delete file.
 * Deletes the corresponding subdiv of file div.
 * Deletes the corresponding editor from textAreaDiv.
 * Toggles to the first editor upon deletion.
 * Socket.emit to delete_file to pass room_id and fileId to backend. 
 */

function deleteFile() {
    const userConfirmed = confirm("Are you sure you want to delete file?");

    if (userConfirmed){
        const tabToDelete = document.getElementById(`file${currentDivOfFile.split('e').pop()}`);
        const editorToDelete = document.getElementById(`editor${currentDivOfFile.split('e').pop()}`);
        const pathToDelete = normalizePath(tabToDelete?.dataset?.path || '');

        if (pathToDelete && fileHandles[pathToDelete]) {
            delete fileHandles[pathToDelete];
        }

        tabToDelete.remove();
        editorToDelete.remove();
        delete editors[`textEditor${currentDivOfFile.split('e').pop()}`]

        const remainingTabs = document.querySelectorAll('#file .tabEditor');
        if (remainingTabs.length > 0) {
            remainingTabs[0].click(); 
        }

        socket.emit('delete_file',{'room': room_id,'fileId':currentDivOfFile});    
    }
}

/*
 * deleteFileByRequest:
 * Deletes the corresponding subdiv of file div.
 * Deletes the corresponding editor from textAreaDiv.
 * Toggles to the first editor upon deletion.
 */

function deleteFileByRequest(fileId) {
    const tabToDelete = document.getElementById(`file${fileId.split('e').pop()}`);
    const editorToDelete = document.getElementById(`editor${fileId.split('e').pop()}`);
    const pathToDelete = normalizePath(tabToDelete?.dataset?.path || '');

    if (pathToDelete && fileHandles[pathToDelete]) {
        delete fileHandles[pathToDelete];
    }

    tabToDelete.remove();
    editorToDelete.remove();
    delete editors[`textEditor${fileId.split('e').pop()}`]

    const remainingTabs = document.querySelectorAll('#file .tabEditor');
    if (remainingTabs.length > 0) {
        remainingTabs[0].click();
    }   
}

/*
 * renameFile:
 * Checks if the filename entered is unique in editors dictionary.
 * Updates the corresponding filename to new filename.
 * Updates the code mirror objects based on file extention provided by user.
 * Updates the contents of the corresponding file.
 * Updates socket.on change for updating each keystroke made in editor.
 * Socket.emit to rename_file to pass room_id, fileId and newFileName to backend. 
 */

function renameFile(){
    let newFileName;

    do {
        newFileName = window.prompt("Enter new file name:", editors[`textEditor${currentDivOfFile.split('e').pop()}`][1]);
        if (!isFileNameUnique(newFileName)) {
            alert("Filename already exists. Please choose a different name.");
        }
    } while (!isFileNameUnique(newFileName));
   if (!newFileName) return; 

    const tempCount = currentDivOfFile.split('e').pop();
    const tempContents = editors[`textEditor${tempCount}`][0].getValue()
    const fileDiv = document.getElementById(currentDivOfFile);
    const oldPath = normalizePath(fileDiv?.dataset?.path || editors[`textEditor${tempCount}`][1]);

    editors[`textEditor${tempCount}`][1] = newFileName;
    setTabLabel(fileDiv, newFileName);

    const parentPath = getParentPath(oldPath);
    const newPath = normalizePath(parentPath ? `${parentPath}/${newFileName}` : newFileName);
    fileDiv.dataset.path = newPath;
    if (oldPath && fileHandles[oldPath]) {
        fileHandles[newPath] = fileHandles[oldPath];
        delete fileHandles[oldPath];
    }

    const codeMirrorDivs = document.querySelectorAll(`#editor${tempCount} > div`);
    codeMirrorDivs.forEach(codeMirrorDiv => {
        if (codeMirrorDiv.className === "CodeMirror cm-s-material-darker"){
            codeMirrorDiv.remove();
        }
    });

    let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain' }
    let fileExtension = newFileName.split('.').pop();
    if (!(fileExtension in syntaxSelector)){
        fileExtension = 'plain';
    }   

    editors[`textEditor${tempCount}`][0] = (CodeMirror.fromTextArea(document.getElementById(`textEditor${tempCount}`), {
                    mode: syntaxSelector[fileExtension],
                    lineNumbers: true,
                    theme: "material-darker",
                    autoCloseBrackets: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    tabSize: 4,
                    smartIndent: true,
                    indentWithTabs: false,
                }));

    editors[`textEditor${tempCount}`][0].setValue(tempContents);
    editors[`textEditor${tempCount}`][2] = editors[`textEditor${tempCount}`][0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            });

    toggleEditor(`editor${tempCount}`);
    socket.emit('rename_file',{'room': room_id,'fileId':currentDivOfFile, 'newFileName':newFileName});
}

/*
 * renameFileByRequest:
 * Updates the corresponding filename to new filename.
 * Updates the code mirror objects based on file extention provided by user.
 * Updates the contents of the corresponding file.
 * Updates socket.on change for updating each keystroke made in editor.
 */

function renameFileByRequest(fileId, newFileName){
    const tempCount = fileId.split('e').pop();
    const tempContents = editors[`textEditor${tempCount}`][0].getValue()
    const fileDiv = document.getElementById(fileId);
    const oldPath = normalizePath(fileDiv?.dataset?.path || editors[`textEditor${tempCount}`][1]);

    editors[`textEditor${tempCount}`][1] = newFileName;
    setTabLabel(fileDiv, newFileName);

    const parentPath = getParentPath(oldPath);
    const newPath = normalizePath(parentPath ? `${parentPath}/${newFileName}` : newFileName);
    fileDiv.dataset.path = newPath;
    if (oldPath && fileHandles[oldPath]) {
        fileHandles[newPath] = fileHandles[oldPath];
        delete fileHandles[oldPath];
    }

    const codeMirrorDivs = document.querySelectorAll(`#editor${tempCount} > div`);
    codeMirrorDivs.forEach(codeMirrorDiv => {
        if (codeMirrorDiv.className === "CodeMirror cm-s-material-darker"){
            codeMirrorDiv.remove();
        }
    });

    let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain' }
    let fileExtension = newFileName.split('.').pop();
    if (!(fileExtension in syntaxSelector)){
        fileExtension = 'plain';
    }   

    editors[`textEditor${tempCount}`][0] = (CodeMirror.fromTextArea(document.getElementById(`textEditor${tempCount}`), {
                    mode: syntaxSelector[fileExtension],
                    lineNumbers: true,
                    theme: "material-darker",
                    autoCloseBrackets: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    tabSize: 4,
                    smartIndent: true,
                    indentWithTabs: false,
                }));

    editors[`textEditor${tempCount}`][0].setValue(tempContents);
    editors[`textEditor${tempCount}`][2] = editors[`textEditor${tempCount}`][0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            });

    toggleEditor(`editor${tempCount}`);
}

/*
 * downloadFile:
 * Initializes an object of JSZip.
 * Creates files based on the filename and its contents from editors dictionary. 
 * Zips the files into a blob.
 * Creates an anchor tag within the document with a link that points to the blob file.
 * Automatically downloads the zipfile as files.zip.
 */

async function downloadFile() {
    const zip = new JSZip();

    for (let [key, values] of Object.entries(editors)) {
        zip.file(`${values[1]}`, values[0].getValue());
    }

    try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const downloadLink = document.createElement("a"); 

        downloadLink.href = URL.createObjectURL(zipBlob);
        downloadLink.download = `files.zip`; 
        downloadLink.click(); 
        URL.revokeObjectURL(downloadLink.href);
    } 
    catch (error) {
        console.error("Error creating the zip file:", error);
    }
}

/*
 * showUsernameAboveCursor:
 * Creates a widget of user who is currently typing.
 * Updates the position dynamicly by removing the old position.
 */

function showUsernameAboveCursor(editor, userName, cursorPosition) {
    if (userCursors.length > 0) {
        const oldWidget = userCursors.splice(0, 1)[0];
        oldWidget.remove();
    }
    const widget = document.createElement('div');
    widget.className = 'username-widget';
    widget.textContent = userName;
    widget.style.position = 'absolute';
    widget.style.backgroundColor = '#f0f0f0';
    widget.style.padding = '2px 5px';
    widget.style.borderRadius = '5px';
    widget.style.fontSize = '12px';
    widget.style.color = '#333';
    widget.style.zIndex = 10;
    editor.addWidget(cursorPosition, widget, true);
    userCursors.push(widget);
}

/*
 * When a user leaves the room this function updates the active users list.
 * Sends room_id and users list to backend.
 */

window.addEventListener('beforeunload', (event) => {
    const index = users.indexOf(userName);
    users.splice(index, 1);
    socket.emit('requested_users', { room: room_id, users});
});

/*
 * copyToClipboard:
 * Copies the url of room.
 */

function copyToClipboard(link = window.location.href) {
    navigator.clipboard.writeText(link)
    alert("Link copied!");
}

//------------------------------------------------------(DEFAULT CODE MIRROR OBJECTS)---------------------------------------------------------

/*
 * Initializes code mirror object for default editor with filename index.py.
 * Initializes code mirror objects for bottom terminal input/output panes.
 */

let editor = [];
editor.push(CodeMirror.fromTextArea(document.getElementById('textEditor1'), {
    mode: "python",
    lineNumbers: true,
    theme: "material-darker",
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 4,
    tabSize: 4,
    smartIndent: true,
    indentWithTabs: false,
}));

editor.push("index.py");

editor.push(editor[0].on('change', () => {
                if (isProgrammaticChange) return;
                const text = currentTextEditor.getValue();
                const cursor = currentTextEditor.getCursor();
                socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
                scheduleLocalAutoSave(currentTextEditorName);
            }));
editors[`textEditor1`] = editor;
currentTextEditor = editors[`textEditor1`][0];
currentTextEditorName = `textEditor1`;

outputArea = CodeMirror.fromTextArea(document.getElementById('outputArea'), {
    mode: "text/plain",
    lineNumbers: false,
    theme: "material-darker",
});
outputArea.getWrapperElement().classList.add('terminal-output-cm');

inputArea = CodeMirror.fromTextArea(document.getElementById('inputArea'), {
    mode: "text/plain",
    lineNumbers: false,
    theme: "material-darker",
});
inputArea.getWrapperElement().classList.add('terminal-input-cm');

initTerminalResize();
switchTerminalTab('terminal');
toggleBottomTerminal(true);
initAIGenShortcut();
initLocalSaveShortcut();
initCodeFixModalShortcuts();
restorePersistedLocalFolder();

//------------------------------------------------------(COMPILE)---------------------------------------------------------

/*
 * fetchData:
 * Fetches the code, input value and file extension, sends it to backend as JSON request.
 * Gets the output as response from backend as JSON response.
 */

function appendDebugMessage(message) {
    const debugArea = document.getElementById('debugConsoleArea');
    if (!debugArea) return;

    const stamp = new Date().toLocaleTimeString();
    const line = `[${stamp}] ${message}`;
    if (debugArea.textContent.includes('No debug messages yet.')) {
        debugArea.textContent = line;
    } else {
        debugArea.textContent += `\n${line}`;
    }
    debugArea.scrollTop = debugArea.scrollHeight;
}

async function fetchData() {
    const code = currentTextEditor.getValue();
    const input = inputArea.getValue();

    toggleBottomTerminal(true);
    switchTerminalTab('output');
    outputArea.setValue('Running...');
    appendDebugMessage(`Run started (${fileExtension})`);

    try {
        const response = await fetch('/compile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ codeVal: code, inputVal: input, langType: fileExtension }),
        });

        const data = await response.json();
        const resultText = (data && typeof data.result === 'string') ? data.result : (data?.error || 'No output');
        outputArea.setValue(resultText);
        appendDebugMessage('Run completed');
    } catch (error) {
        const message = `Run failed: ${error.message}`;
        outputArea.setValue(message);
        appendDebugMessage(message);
    }

    refreshTerminalEditors();
}

//------------------------------------------------------(SOCKET)---------------------------------------------------------

const socket = io();

/*
 * Emits join function upon loading the page(editor.html) once.
 * Sends room_id and userName to backend.
 */

if (!window.hasRunOnce) {
    window.hasRunOnce = true;
    socket.emit('join', { room: room_id, userName : userName });
}

/*
 * Calls createFileByRequest function upon response from backend.
 * Passing textEditorId , content and fileName from the response.
 * Updates the fileCount.
 */

socket.on('create_new_file', (data)=>{
    if ((data.room === room_id) && (!(`textEditor${data.fileCount}` in editors))){
        fileCount = data.fileCount;
        createFileByRequest(`textEditor${data.fileCount}`, "", data.fileName, data.parentPath || '', data.fullPath || '');
    }
})

socket.on('create_new_folder', (data) => {
    if (data.room !== room_id) return;

    const parentPath = data.parentPath || '';
    const folderPath = data.folderPath || (parentPath ? `${parentPath}/${data.folderName}` : data.folderName);
    if (!folderPath || findFolderDomByPath(folderPath)) return;

    const incomingId = parseInt(data.folderId, 10);
    const folderId = Number.isFinite(incomingId) ? incomingId : ++nodeIdCounter;
    nodeIdCounter = Math.max(nodeIdCounter, folderId);

    const { container, depth } = getContainerByFolderPath(parentPath);

    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder collapsed';
    folderDiv.style.paddingLeft = `${depth * 16}px`;
    folderDiv.dataset.path = folderPath;
    folderDiv.dataset.folderId = String(folderId);
    folderDiv.innerHTML = buildFolderRowHTML(data.folderName);

    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'folder-children';
    childrenDiv.dataset.depth = String(depth + 1);

    folderDiv.onclick = (e) => {
        e.stopPropagation();
        toggleFolder(folderDiv, childrenDiv);
        selectFolder(folderDiv, childrenDiv, folderPath, folderId);
    };

    container.appendChild(folderDiv);
    container.appendChild(childrenDiv);

    if (!isPathInTree(fileSystemTree, folderPath)) {
        const newNode = { id: folderId, name: data.folderName, type: 'folder', path: folderPath, children: [] };
        const parentId = parentPath ? findFolderIdByPath(fileSystemTree, parentPath) : null;
        if (parentId !== null) {
            addItemToFolder(fileSystemTree, parentId, newNode);
        } else {
            fileSystemTree.push(newNode);
        }
    }
});

/*
 * Calls deleteFileByRequest function upon response from backend.
 * Passing fileId from the response.
 */

socket.on('delete_file', (data) => {
    if (data.room === room_id){
        deleteFileByRequest(data.fileId);
    }
})

/*
 * Calls renameFileByRequest function upon response from backend.
 * Passing fileId and newFileName from the response.
 */

socket.on('rename_file', (data) => {
    if (data.room === room_id){
        renameFileByRequest(data.fileId, data.newFileName);
    }
})

socket.on('rename_folder', (data) => {
    if (data.room !== room_id) return;
    const targetId = resolveFolderId(data.folderId, data.oldPath || data.folderPath || '');
    if (targetId !== null) {
        renameFolder(targetId, data.newName, false);
    }
});

socket.on('delete_folder', (data) => {
    if (data.room !== room_id) return;
    const targetId = resolveFolderId(data.folderId, data.folderPath || '');
    if (targetId !== null) {
        deleteFolder(targetId, false, data.folderPath || '');
    }
});

/*
 * Appends new users name to users list.
 * Emits users list back to requested_users exepct the new user.
 */

socket.on('request_users',(data) =>{
    if(data.room === room_id){
        users.push(data.userName)
        if(!(users.length === 1)){
            socket.emit('requested_users', { room: room_id, users});
        }
    }
});

/*
 * Replaces users list with new users list sent from backend.
 * Displayes the updated user list in users div.
 */

socket.on('create_users',(data) =>{
    if(data.room === room_id){
        users = data.users;
        const usersContainer = document.querySelector(".user");
        usersContainer.innerHTML = "";
        users.forEach(user => {
            const userDiv = document.createElement("div");
            userDiv.className = "userWrapper";

            const avatarDiv = document.createElement("div");
            avatarDiv.className = "userDisplay";
            avatarDiv.textContent = user[0].toUpperCase();


            const nameDiv = document.createElement("div");
            nameDiv.className = "userName";
            nameDiv.title = user;
            nameDiv.textContent = user;


            if (user.length > 10) {
                nameDiv.classList.add("tooltip");
                nameDiv.setAttribute("title", user);
            }

            userDiv.appendChild(avatarDiv);
            userDiv.appendChild(nameDiv);
            usersContainer.appendChild(userDiv);
        });
    }
});

/*
 * Creates a temporary list with textEditorId, contents and fileName of each editor.
 * Emits requested_editors function to all other users except the newly joined user.
 */

socket.on('request_editors', (data) => {
    let currentEditors = [];
    for(let [key, values] of Object.entries(editors)){
        let temp = [];
        temp.push(key)
        temp.push(values[0].getValue());
        temp.push(values[1]);
        currentEditors.push(temp);
    }
    if(!(currentEditors.length === 1 && 
        currentEditors[0][1] === "#hello1" && 
        currentEditors[0][2] === "index.py")){
        socket.emit('requested_editors', { room: room_id, currentEditors, fileCount});
    }
    
});

/*
 * Creates a temporary list with textEditorId, contents and fileName of each editor.
 * Removes the first file and creates all files for the newly joined user.
 * Toggles to the first editor.
 */

socket.on('create_editors', (data) => {
    let currentEditors = [];
    for(let [key, values] of Object.entries(editors)){
        let temp = [];
        temp.push(key)
        temp.push(values[0].getValue());
        temp.push(values[1]);
        currentEditors.push(temp);
    }
    if ((data.room === room_id) && 
        (currentEditors.length === 1 && 
        currentEditors[0][1] === "#hello1" && 
        currentEditors[0][2] === "index.py")){
        deleteFileByRequest('file1');
        fileCount = data.fileCount;
        for(let sublist of data.currentEditors){
            createFileByRequest(sublist[0],sublist[1],sublist[2]);
        }

        let firstEditor =`editor${Object.keys(editors)[0].split('r').pop()}`; 
        toggleEditor(firstEditor);
    }
});

/*
 * Updates each keystroke of the current textEditor displayed.
 * Updates the cursor position after each keystroke.
 */

let isProgrammaticChange = false;
socket.on('update_text', (data) => {
    isProgrammaticChange = true;
    let tempTextEditor = editors[data.currentTextEditorName][0];
    const cursor = tempTextEditor.getCursor();
    tempTextEditor.setValue(data.text);
    tempTextEditor.setCursor(cursor);
    showUsernameAboveCursor(tempTextEditor, data.userName, data.cursor);
    isProgrammaticChange = false;
});
// Store uploaded folder files for lazy-reading when their tab becomes active
let uploadedFilesByEditorId = {};

function getEditorKeyFromEditorId(editorId) {
    return `textEditor${editorId.split('r').pop()}`;
}

function triggerFolderUpload() {
    document.getElementById('folderUploadInput').click();
}

function handleFolderUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const tree = buildFolderTree(files);
    console.log('Uploaded folder structure:', tree);

    const fileDiv = document.getElementById('file');
    const firstPath = files[0].webkitRelativePath || files[0].name;
    const rootFolder = firstPath.split('/')[0];
    const folderContainer = createFolderUI(rootFolder);
    fileDiv.insertBefore(folderContainer, fileDiv.firstChild);

    files.forEach((file) => {
        const rel = file.webkitRelativePath || file.name;
        const parts = rel.split('/');
        const displayName = parts.slice(1).join('/') || parts[0];
        const uniqueFileName = rel;

        fileCount++;
        const tabId = `file${fileCount}`;
        const editorId = `editor${fileCount}`;

        const fileTab = document.createElement('div');
        fileTab.id = tabId;
        fileTab.className = 'tabEditor';
        fileTab.setAttribute('onclick', `toggleEditor('${editorId}')`);
        fileTab.setAttribute('oncontextmenu', `popupMenu(event)`);
        setTabLabel(fileTab, displayName);
        folderContainer.querySelector('.folder-files').appendChild(fileTab);
        fileTab.addEventListener('click', (e) => { e.stopPropagation(); setActiveTab(fileTab); });

        const textAreaDiv = document.getElementById('textAreaDiv');
        const newEditor = document.createElement('div');
        const newTextArea = document.createElement('textarea');
        newEditor.id = editorId;
        newTextArea.id = `textEditor${fileCount}`;
        newTextArea.rows = 100;
        newTextArea.cols = 100;
        newEditor.appendChild(newTextArea);
        textAreaDiv.appendChild(newEditor);

        let syntaxSelector = {cpp : 'text/x-c++src', py : 'python', plain: 'text/plain'};
        let fileExtension = displayName.split('.').pop();
        if (!(fileExtension in syntaxSelector)) {
            fileExtension = 'plain';
        }

        const editor = [];
        editor.push(CodeMirror.fromTextArea(document.getElementById(`textEditor${fileCount}`), {
            mode: syntaxSelector[fileExtension],
            lineNumbers: true,
            theme: 'material-darker',
            autoCloseBrackets: true,
            matchBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            smartIndent: true,
            indentWithTabs: false,
        }));
        editor.push(uniqueFileName);
        editor.push(editor[0].on('change', () => {
            if (isProgrammaticChange) return;
            const text = currentTextEditor.getValue();
            const cursor = currentTextEditor.getCursor();
            socket.emit('update_text', { room: room_id, text, currentTextEditorName, userName, cursor });
            scheduleLocalAutoSave(currentTextEditorName);
        }));

        editors[`textEditor${fileCount}`] = editor;
        uploadedFilesByEditorId[editorId] = file;

        fileTab.addEventListener('click', () => {
            loadUploadedFile(editorId);
        });
    });
}

function loadUploadedFile(editorId) {
    const file = uploadedFilesByEditorId[editorId];
    if (!file) return;

    const editorKey = getEditorKeyFromEditorId(editorId);
    const cm = editors[editorKey] && editors[editorKey][0];
    if (!cm) return;

    if (cm.getValue().trim().length > 0) return;

    const reader = new FileReader();
    reader.onload = () => {
        cm.setValue(reader.result);
    };
    reader.readAsText(file);
}

function buildFolderTree(files) {
    const root = {};
    files.forEach((file) => {
        const parts = (file.webkitRelativePath || file.name).split('/');
        let node = root;
        parts.forEach((part, idx) => {
            if (!node[part]) {
                node[part] = idx === parts.length - 1 ? file : {};
            }
            node = node[part];
        });
    });
    return root;
}

function createFolderUI(folderName) {
    const folderContainer = document.createElement('div');
    folderContainer.className = 'folder-container';

    const header = document.createElement('div');
    header.className = 'folder-header';
    header.textContent = folderName;
    folderContainer.appendChild(header);

    const filesDiv = document.createElement('div');
    filesDiv.className = 'folder-files';
    folderContainer.appendChild(filesDiv);

    return folderContainer;
}
// ─── Deselect folder when the user clicks on empty space in the explorer ──────
// Clicking directly on #file (not on a .folder, .tabEditor, or button inside it)
// resets the "New File / New Folder" target back to the root level.
document.getElementById('file').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        deselectFolder();
    }
});
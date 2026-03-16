
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

/*
 * setTabLabel:
 * Sets icon + name HTML inside a .tabEditor element and sets data-ext for CSS file-type styling.
 */
function setTabLabel(el, fileName) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    el.setAttribute('data-ext', ext);
    el.innerHTML = '<span class="item-icon"></span><span class="item-name">' + fileName + '</span>';
}

/*
 * buildFolderRowHTML:
 * Returns the inner HTML string for a folder row (chevron + icon + name).
 */
function buildFolderRowHTML(name) {
    return '<span class="folder-chevron"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg></span>' +
           '<span class="item-icon"></span>' +
           '<span class="item-name">' + name + '</span>';
}

/*
 * createFolder:
 * Appends an inline rename row to #file so the user can type a folder name.
 * On Enter / blur it commits: creates a proper folder row + sibling children div.
 */
function createFolder() {
    const fileDiv = document.getElementById('file');
    const inputRow = document.createElement('div');
    inputRow.className = 'inline-rename-row';
    inputRow.innerHTML =
        '<span class="folder-chevron"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg></span>' +
        '<span class="item-icon"></span>' +
        '<input class="inline-rename-input" type="text" placeholder="folder name">';
    fileDiv.appendChild(inputRow);

    const input = inputRow.querySelector('.inline-rename-input');
    input.focus();

    let committed = false;
    function commit() {
        if (committed) return;
        committed = true;
        const name = input.value.trim();
        inputRow.remove();
        if (!name) return;

        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder collapsed';
        folderDiv.innerHTML = buildFolderRowHTML(name);

        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'folder-children';
        folderDiv.onclick = () => toggleFolder(folderDiv, childrenDiv);

        fileDiv.appendChild(folderDiv);
        fileDiv.appendChild(childrenDiv);
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { committed = true; inputRow.remove(); }
    });
    input.addEventListener('blur', commit);
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
 * To switch tabs between file, user and run.
 * Retracts the editor when tab is clicked twice.
 */

function toggleTab(tabId, event) {
    const ioAreaDiv = document.getElementById("ioAreaDiv");
    const textAreaDiv = document.getElementById("textAreaDiv");
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.content');

    if (activeTab === tabId) {
        isRetracted = !isRetracted;
        if (isRetracted) {
            ioAreaDiv.classList.add("retracted");
            textAreaDiv.style.flexGrow = "100"; 
        } else {
            ioAreaDiv.classList.remove("retracted");
            textAreaDiv.style.flexGrow = "2"; 
        }
        return;
    }

    isRetracted = false;
    ioAreaDiv.classList.remove("retracted");
    textAreaDiv.style.flexGrow = "2"; 

    // Hide all content sections and remove the active class from all tabs
    contents.forEach(content => content.classList.add("hidden"));
    tabs.forEach(tab => tab.classList.remove("active"));

    // Show the selected tab's content and mark the clicked tab as active
    document.getElementById(tabId).classList.remove("hidden");
    event.target.closest(".tab").classList.add("active");

    // Update the active tab
    activeTab = tabId;
}

/*
 * toggleEditor:
 * To switch between editors. 
 */

function toggleEditor(editorId) {         
    const editorsDiv = document.querySelectorAll('#textAreaDiv > div');
    const tabEditors = document.querySelectorAll('#file > div');

    editorsDiv.forEach(editor => {
        editor.style.display = editor.id === editorId ? 'block' : 'none';
    });

    tabEditors.forEach(editor => {
        if(editor.id != "file-box"){
            if(editor.id.split('e').pop() == editorId.split('r').pop()){
                editor.classList = "tabEditor active"
            }
            else{
                editor.classList = "tabEditor"
            }
        }
    });

    const tab = document.querySelector(`#file .tabEditor[onclick*="${editorId}"]`);

    if (tab) {
        fileExtension = tab.textContent.split('.').pop();
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
    let fileName;

    do {
        fileName = window.prompt("Enter file name");
        if (!isFileNameUnique(fileName)) {
            alert("Filename already exists. Please choose a different name.");
        }
    } while (!isFileNameUnique(fileName));

    if (!fileName) return; 
    fileCount++; 
    const newEditorId = `editor${fileCount}`;
    const fileDiv = document.getElementById('file');
    const newTab = document.createElement('div');

    newTab.id = `file${fileCount}`;
    newTab.className = "tabEditor active";
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
            }));

    editors[`textEditor${fileCount}`] = editor;
    socket.emit('create_new_file', {'room':room_id,'fileCount': fileCount, 'fileName': fileName});
    toggleEditor(newEditorId);
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

        // Recursively scan the directory
        const structure = await scanDirectory(directoryHandle, '');

        console.log('Opened folder structure:', structure);

        // Update the sidebar
        updateFileListFromHandles(structure);

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

    for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = path ? `${path}/${name}` : name;
        
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
 * updateFileListFromHandles:
 * Updates the file list in the sidebar based on the scanned directory structure.
 */

function updateFileListFromHandles(structure, parentElement = document.getElementById('file'), indent = 0) {
    // Clear existing file list (keep the file-box)
    const fileBox = document.getElementById('file-box');
    const existingFiles = parentElement.querySelectorAll('.tabEditor, .folder');
    existingFiles.forEach(el => el.remove());

    // Add the new structure
    structure.forEach(item => {
        if (item.type === 'file') {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'tabEditor';
            fileDiv.style.paddingLeft = `${8 + indent * 16}px`;
            setTabLabel(fileDiv, item.name);
            fileDiv.onclick = () => openFileFromHandle(item.path);
            fileDiv.oncontextmenu = (event) => popupMenu(event);
            parentElement.appendChild(fileDiv);
        } else if (item.type === 'folder') {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder collapsed';
            folderDiv.style.paddingLeft = `${indent * 16}px`;
            folderDiv.innerHTML = buildFolderRowHTML(item.name);

            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'folder-children';
            folderDiv.onclick = () => toggleFolder(folderDiv, childrenDiv);

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
        const handle = fileHandles[path];
        if (!handle) {
            alert('File handle not found');
            return;
        }

        const file = await handle.getFile();
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            createFileFromContent(handle.name, content);
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

function createFileFromContent(fileName, content) {
    if (!isFileNameUnique(fileName)) {
        alert("Filename already exists. Please choose a different name.");
        return;
    }

    fileCount++;
    const newEditorId = `editor${fileCount}`;
    const fileDiv = document.getElementById('file');
    const newTab = document.createElement('div');

    newTab.id = `file${fileCount}`;
    newTab.className = "tabEditor active";
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

function updateFileList(structure, parentElement = document.getElementById('file'), indent = 0) {
    for (const [name, item] of Object.entries(structure)) {
        if (item instanceof File) {
            // It's a file
            const fileDiv = document.createElement('div');
            fileDiv.className = 'tabEditor';
            fileDiv.style.paddingLeft = `${8 + indent * 16}px`;
            setTabLabel(fileDiv, name);
            fileDiv.onclick = () => openUploadedFile(item);
            fileDiv.oncontextmenu = (event) => popupMenu(event);
            parentElement.appendChild(fileDiv);
        } else {
            // It's a folder
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder collapsed';
            folderDiv.style.paddingLeft = `${indent * 16}px`;
            folderDiv.innerHTML = buildFolderRowHTML(name);

            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'folder-children';
            folderDiv.onclick = () => toggleFolder(folderDiv, childrenDiv);

            parentElement.appendChild(folderDiv);
            parentElement.appendChild(childrenDiv);

            updateFileList(item, childrenDiv, indent + 1);
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
    newTab.className = "tabEditor active";
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

function createFileByRequest(textEditorid, content, fileName) {

    let tempCount = textEditorid.split('r').pop()
    const newEditorId = `editor${tempCount}`;
    const fileDiv = document.getElementById('file');
    const newTab = document.createElement('div');

    newTab.id = `file${tempCount}`;
    newTab.className = "tabEditor active";
    newTab.setAttribute('onclick', `toggleEditor('${newEditorId}')`);
    newTab.setAttribute('oncontextmenu', `popupMenu(event)`);
    setTabLabel(newTab, fileName);
    fileDiv.appendChild(newTab);

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

    editors[`textEditor${tempCount}`][1] = newFileName;
    setTabLabel(fileDiv, newFileName);

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

    editors[`textEditor${tempCount}`][1] = newFileName;
    setTabLabel(fileDiv, newFileName);

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
 * Initializes code mirror objects for outputArea and inputArea in run tab.
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
            }));
editors[`textEditor1`] = editor;
currentTextEditor = editors[`textEditor1`][0];
currentTextEditorName = `textEditor1`;

var outputArea = CodeMirror.fromTextArea(document.getElementById('outputArea'), {
    mode: "text/plain",
    lineNumbers: false,
    theme: "material-darker",
});
outputArea.getWrapperElement().classList.add('result-codemirror');

var inputArea = CodeMirror.fromTextArea(document.getElementById('inputArea'), {
    mode: "text/plain",
    lineNumbers: false,
    theme: "material-darker",
});
inputArea.getWrapperElement().classList.add('result-codemirror');

//------------------------------------------------------(COMPILE)---------------------------------------------------------

/*
 * fetchData:
 * Fetches the code, input value and file extension, sends it to backend as JSON request.
 * Gets the output as response from backend as JSON response.
 */

async function fetchData() {
const code = currentTextEditor.getValue();
const input = inputArea.getValue();

const response = await fetch('/compile', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({codeVal:code,inputVal:input,langType:fileExtension}),
});

const data = await response.json();
outputArea.setValue(data.result);
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
        createFileByRequest(`textEditor${data.fileCount}`,"", data.fileName);
    }
})

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

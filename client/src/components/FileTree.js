import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Braces, ChevronDown, ChevronRight, File, FileCode2, FileJson2, FileText, Folder, FolderOpen, } from 'lucide-react';
function getFileIcon(name) {
    const extension = name.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'py':
            return { Icon: FileCode2, className: 'tree-icon--python' };
        case 'js':
        case 'jsx':
            return { Icon: FileCode2, className: 'tree-icon--javascript' };
        case 'ts':
        case 'tsx':
            return { Icon: FileCode2, className: 'tree-icon--typescript' };
        case 'json':
            return { Icon: FileJson2, className: 'tree-icon--json' };
        case 'html':
        case 'css':
            return { Icon: Braces, className: 'tree-icon--markup' };
        case 'md':
        case 'txt':
            return { Icon: FileText, className: 'tree-icon--text' };
        default:
            return { Icon: File, className: 'tree-icon--default' };
    }
}
function FileTree({ nodes, expandedFolders, selectedFilePath, contextMenuPath = null, onToggleFolder, onSelectFile, onItemContextMenu, level = 0, }) {
    return (_jsx("div", { className: "tree-group", children: nodes.map((node) => {
            const isFolder = node.kind === 'folder';
            const isExpanded = isFolder && expandedFolders.has(node.path);
            const isSelectedFile = !isFolder && node.path === selectedFilePath;
            const isContextTarget = node.path === contextMenuPath;
            const { Icon, className } = isFolder
                ? { Icon: isExpanded ? FolderOpen : Folder, className: 'tree-icon--folder' }
                : getFileIcon(node.name);
            return (_jsxs("div", { className: "tree-node", children: [_jsxs("button", { type: "button", className: [
                            'tree-row',
                            isSelectedFile ? 'active' : '',
                            isContextTarget ? 'context-open' : '',
                        ]
                            .filter(Boolean)
                            .join(' '), style: { paddingLeft: `${8 + level * 12}px` }, "aria-expanded": isFolder ? isExpanded : undefined, onClick: () => {
                            if (isFolder) {
                                onToggleFolder(node.path);
                            }
                            else {
                                onSelectFile(node);
                            }
                        }, onContextMenu: (event) => onItemContextMenu(event, node), children: [_jsx("span", { className: `tree-chevron ${isFolder ? 'tree-chevron--folder' : 'tree-chevron--spacer'}`, "aria-hidden": "true", children: isFolder ? (isExpanded ? _jsx(ChevronDown, { size: 14, strokeWidth: 2.1 }) : _jsx(ChevronRight, { size: 14, strokeWidth: 2.1 })) : null }), _jsx("span", { className: `tree-icon ${className}`, "aria-hidden": "true", children: _jsx(Icon, { size: 14, strokeWidth: 1.9 }) }), _jsx("span", { className: "tree-label", children: node.name })] }), isFolder && isExpanded && node.children.length > 0 && (_jsx(FileTree, { nodes: node.children, expandedFolders: expandedFolders, selectedFilePath: selectedFilePath, contextMenuPath: contextMenuPath, level: level + 1, onToggleFolder: onToggleFolder, onSelectFile: onSelectFile, onItemContextMenu: onItemContextMenu }))] }, node.path));
        }) }));
}
export default FileTree;

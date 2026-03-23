import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Braces,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';
import type { FileNode } from '../types';

interface FileTreeProps {
  nodes: FileNode[];
  expandedFolders: Set<string>;
  selectedFilePath: string | null;
  contextMenuPath?: string | null;
  level?: number;
  onToggleFolder: (path: string) => void;
  onSelectFile: (node: FileNode) => void;
  onItemContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, node: FileNode) => void;
}

function getFileIcon(name: string) {
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

function FileTree({
  nodes,
  expandedFolders,
  selectedFilePath,
  contextMenuPath = null,
  onToggleFolder,
  onSelectFile,
  onItemContextMenu,
  level = 0,
}: FileTreeProps) {
  return (
    <div className="tree-group">
      {nodes.map((node) => {
        const isFolder = node.kind === 'folder';
        const isExpanded = isFolder && expandedFolders.has(node.path);
        const isSelectedFile = !isFolder && node.path === selectedFilePath;
        const isContextTarget = node.path === contextMenuPath;
        const { Icon, className } = isFolder
          ? { Icon: isExpanded ? FolderOpen : Folder, className: 'tree-icon--folder' }
          : getFileIcon(node.name);

        return (
          <div key={node.path} className="tree-node">
            <button
              type="button"
              className={[
                'tree-row',
                isSelectedFile ? 'active' : '',
                isContextTarget ? 'context-open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: `${8 + level * 12}px` }}
              aria-expanded={isFolder ? isExpanded : undefined}
              onClick={() => {
                if (isFolder) {
                  onToggleFolder(node.path);
                } else {
                  onSelectFile(node);
                }
              }}
              onContextMenu={(event) => onItemContextMenu(event, node)}
            >
              <span
                className={`tree-chevron ${isFolder ? 'tree-chevron--folder' : 'tree-chevron--spacer'}`}
                aria-hidden="true"
              >
                {isFolder ? (
                  isExpanded ? <ChevronDown size={14} strokeWidth={2.1} /> : <ChevronRight size={14} strokeWidth={2.1} />
                ) : null}
              </span>
              <span className={`tree-icon ${className}`} aria-hidden="true">
                <Icon size={14} strokeWidth={1.9} />
              </span>
              <span className="tree-label">{node.name}</span>
            </button>

            {isFolder && isExpanded && node.children.length > 0 && (
              <FileTree
                nodes={node.children}
                expandedFolders={expandedFolders}
                selectedFilePath={selectedFilePath}
                contextMenuPath={contextMenuPath}
                level={level + 1}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onItemContextMenu={onItemContextMenu}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FileTree;

import { Braces, File, FileCode2, FileJson2, FileText, X } from 'lucide-react';

type EditorTabItem = {
  id: string;
  name: string;
  path: string;
  content: string;
};

interface EditorTabsProps {
  tabs: EditorTabItem[];
  activeFileId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

function getTabIcon(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'py':
      return { Icon: FileCode2, className: 'editor-tab-icon--python' };
    case 'js':
    case 'jsx':
      return { Icon: FileCode2, className: 'editor-tab-icon--javascript' };
    case 'ts':
    case 'tsx':
      return { Icon: FileCode2, className: 'editor-tab-icon--typescript' };
    case 'json':
      return { Icon: FileJson2, className: 'editor-tab-icon--json' };
    case 'html':
    case 'css':
      return { Icon: Braces, className: 'editor-tab-icon--markup' };
    case 'md':
    case 'txt':
      return { Icon: FileText, className: 'editor-tab-icon--text' };
    default:
      return { Icon: File, className: 'editor-tab-icon--default' };
  }
}

function EditorTabs({ tabs, activeFileId, onSelectTab, onCloseTab }: EditorTabsProps) {
  if (tabs.length === 0) {
    return (
      <div className="editor-tabs editor-tabs--empty">
        <span className="editor-tabs-empty-text">No open files</span>
      </div>
    );
  }

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open files tabs">
      {tabs.map((tab) => {
        const isActive = tab.id === activeFileId;
        const { Icon, className } = getTabIcon(tab.path);

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            className={['editor-tab', isActive ? 'active' : ''].filter(Boolean).join(' ')}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTab(tab.id);
              }
            }}
            title={tab.path}
          >
            <span className={['editor-tab-icon', className].join(' ')} aria-hidden="true">
              <Icon size={14} strokeWidth={1.9} />
            </span>
            <span className="editor-tab-name">{tab.name}</span>
            <button
              type="button"
              className="editor-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default EditorTabs;

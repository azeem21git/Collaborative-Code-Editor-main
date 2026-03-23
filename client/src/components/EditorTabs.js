import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Braces, File, FileCode2, FileJson2, FileText, X } from 'lucide-react';
function getTabIcon(path) {
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
function EditorTabs({ tabs, activeFileId, onSelectTab, onCloseTab }) {
    if (tabs.length === 0) {
        return (_jsx("div", { className: "editor-tabs editor-tabs--empty", children: _jsx("span", { className: "editor-tabs-empty-text", children: "No open files" }) }));
    }
    return (_jsx("div", { className: "editor-tabs", role: "tablist", "aria-label": "Open files tabs", children: tabs.map((tab) => {
            const isActive = tab.id === activeFileId;
            const { Icon, className } = getTabIcon(tab.path);
            return (_jsxs("div", { role: "tab", "aria-selected": isActive, tabIndex: 0, className: ['editor-tab', isActive ? 'active' : ''].filter(Boolean).join(' '), onClick: () => onSelectTab(tab.id), onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectTab(tab.id);
                    }
                }, title: tab.path, children: [_jsx("span", { className: ['editor-tab-icon', className].join(' '), "aria-hidden": "true", children: _jsx(Icon, { size: 14, strokeWidth: 1.9 }) }), _jsx("span", { className: "editor-tab-name", children: tab.name }), _jsx("button", { type: "button", className: "editor-tab-close", "aria-label": `Close ${tab.name}`, onClick: (event) => {
                            event.stopPropagation();
                            onCloseTab(tab.id);
                        }, children: _jsx(X, { size: 12, strokeWidth: 2.2 }) })] }, tab.id));
        }) }));
}
export default EditorTabs;

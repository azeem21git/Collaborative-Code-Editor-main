import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function ExplorerContextMenu({ x, y, items }) {
    if (items.length === 0) {
        return null;
    }
    return (_jsx("div", { className: "explorer-context-menu", style: { left: x, top: y }, onClick: (event) => event.stopPropagation(), onContextMenu: (event) => event.preventDefault(), children: items.map(({ label, icon: Icon, onClick, shortcut, danger, disabled, separatorAbove }) => (_jsxs("button", { type: "button", className: [
                'explorer-context-menu__item',
                danger ? 'explorer-context-menu__item--danger' : '',
                separatorAbove ? 'explorer-context-menu__item--separator' : '',
            ]
                .filter(Boolean)
                .join(' '), onClick: onClick, disabled: disabled, children: [_jsx("span", { className: "explorer-context-menu__icon", "aria-hidden": "true", children: _jsx(Icon, { size: 14, strokeWidth: 1.9 }) }), _jsx("span", { className: "explorer-context-menu__label", children: label }), shortcut ? _jsx("span", { className: "explorer-context-menu__shortcut", children: shortcut }) : null] }, label))) }));
}
export default ExplorerContextMenu;

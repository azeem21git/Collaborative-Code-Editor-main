import type { LucideIcon } from 'lucide-react';

export interface ExplorerContextMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorAbove?: boolean;
}

interface ExplorerContextMenuProps {
  x: number;
  y: number;
  items: ExplorerContextMenuItem[];
}

function ExplorerContextMenu({ x, y, items }: ExplorerContextMenuProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="explorer-context-menu"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map(({ label, icon: Icon, onClick, shortcut, danger, disabled, separatorAbove }) => (
        <button
          key={label}
          type="button"
          className={[
            'explorer-context-menu__item',
            danger ? 'explorer-context-menu__item--danger' : '',
            separatorAbove ? 'explorer-context-menu__item--separator' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onClick}
          disabled={disabled}
        >
          <span className="explorer-context-menu__icon" aria-hidden="true">
            <Icon size={14} strokeWidth={1.9} />
          </span>
          <span className="explorer-context-menu__label">{label}</span>
          {shortcut ? <span className="explorer-context-menu__shortcut">{shortcut}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default ExplorerContextMenu;

import { Maximize2, Minus, X } from 'lucide-react';

type WindowAction = 'close' | 'minimize' | 'zoom';

export function DesktopWindowControls(props: {
  onAction(action: WindowAction): Promise<void>;
}) {
  const actions = [
    { action: 'close', label: 'Close window', Icon: X },
    { action: 'minimize', label: 'Minimize window', Icon: Minus },
    { action: 'zoom', label: 'Zoom window', Icon: Maximize2 }
  ] as const;

  return (
    <div className="desktop-window-controls" role="group" aria-label="Window controls">
      {actions.map(({ action, label, Icon }) => (
        <button
          key={action}
          type="button"
          className={`desktop-window-control desktop-window-control-${action}`}
          aria-label={label}
          title={label}
          onClick={() => void props.onAction(action).catch(error => {
            console.error('Failed to control desktop window', error);
          })}
        >
          <Icon size={9} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

import { PanelLeftClose } from 'lucide-react';
import type { ReactNode } from 'react';

export function ConversationHeader(props: {
  title: string;
  taskToolbar?: ReactNode;
  fileWorkspaceOpen?: boolean;
  onOpenLocation(): void;
}) {
  return (
    <header className={`conversation-header${props.taskToolbar ? ' conversation-header--task' : ''}`}>
      <div className="conversation-title">
        <div className="conversation-title-row">
          <h1>{props.title}</h1>
        </div>
      </div>
      <div className="conversation-actions">
        <button
          className="sidebar-collapse-button conversation-file-button"
          type="button"
          aria-label="Files"
          aria-pressed={props.fileWorkspaceOpen === true}
          title={props.fileWorkspaceOpen ? 'Collapse file workspace' : 'Open file workspace'}
          onClick={props.onOpenLocation}
        >
          <PanelLeftClose aria-hidden="true" size={18} strokeWidth={1.85} />
        </button>
      </div>
      {props.taskToolbar ? (
        <div className="conversation-task-strip">{props.taskToolbar}</div>
      ) : null}
    </header>
  );
}

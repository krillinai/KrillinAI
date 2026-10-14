import { FolderOpen, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import type { FileEditorMode } from './FileEditorPane.js';

type FileTopBarProps = {
  fileName?: string;
  rootName?: string;
  path?: string;
  dirty?: boolean;
  treeCollapsed?: boolean;
  mode?: FileEditorMode;
  canToggleMode?: boolean;
  canSave?: boolean;
  saveDisabled?: boolean;
  onModeChange?(mode: FileEditorMode): void;
  onSave?(): void;
  onOpenFile?(): void;
  onToggleTree?(): void;
  onClose(): void;
};

export function FileTopBar(props: FileTopBarProps) {
  const title = props.fileName ?? 'File workspace';
  const segments = props.path?.split('/').filter(Boolean) ?? [];

  return (
    <header className="file-top-bar">
      <div className="file-top-bar-title-row">
        <div className="file-top-bar-title">
          <strong>{title}</strong>
          {props.dirty ? <span className="dirty-indicator" aria-label="Unsaved">Unsaved</span> : null}
        </div>
        <button
          className="icon-button file-toolbar-icon-button"
          type="button"
          aria-label="Close file workspace"
          title="Close file workspace"
          onClick={props.onClose}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="file-top-bar-control-row">
        <div className="file-top-bar-path-group">
          <nav className="file-top-bar-path" aria-label="File path">
            <span>{props.rootName ?? 'Workspace'}</span>
            {segments.flatMap((segment, index) => [
              <span className="file-top-bar-path-separator" key={`${props.path ?? ''}:separator:${index}`}>/</span>,
              <span key={`${props.path ?? ''}:${index}`}>{segment}</span>
            ])}
          </nav>
          {props.onOpenFile ? (
            <button
              className="icon-button file-top-bar-path-open-button"
              type="button"
              aria-label="Open file"
              title="Open file"
              disabled={!props.path}
              onClick={props.onOpenFile}
            >
              <FolderOpen aria-hidden="true" size={15} />
            </button>
          ) : null}
        </div>

        <div className="file-top-bar-actions">
          {props.canToggleMode && props.mode && props.onModeChange ? (
            <div className="file-editor-mode-toggle" aria-label="File view mode">
              <button
                type="button"
                aria-pressed={props.mode === 'preview'}
                onClick={() => props.onModeChange?.('preview')}
              >
                Preview
              </button>
              <button
                type="button"
                aria-pressed={props.mode === 'edit'}
                onClick={() => props.onModeChange?.('edit')}
              >
                Edit
              </button>
            </div>
          ) : null}
          {props.canSave ? (
            <button
              className="editor-save-button file-top-save-button"
              type="button"
              disabled={props.saveDisabled}
              onClick={() => props.onSave?.()}
            >
              Save
            </button>
          ) : null}
          {props.onToggleTree ? (
            <button
              className="icon-button file-toolbar-icon-button"
              type="button"
              aria-label={props.treeCollapsed ? 'Expand file tree' : 'Collapse file tree'}
              aria-pressed={props.treeCollapsed}
              title={props.treeCollapsed ? 'Expand file tree' : 'Collapse file tree'}
              onClick={props.onToggleTree}
            >
              {props.treeCollapsed ? (
                <PanelRightOpen aria-hidden="true" size={16} />
              ) : (
                <PanelRightClose aria-hidden="true" size={16} />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

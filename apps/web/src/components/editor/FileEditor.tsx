export type FileEditorProps = {
  path: string;
  content: string;
  dirty: boolean;
  saving?: boolean;
  loadError?: string;
  saveError?: string;
  onChange(content: string): void;
  onSave(): void;
};

export function FileEditor(props: FileEditorProps) {
  const errors = [props.loadError, props.saveError].filter((error): error is string => error !== undefined);

  return (
    <div className="file-editor">
      <div className="file-editor-head">
        <div className="file-editor-title">
          <strong>{props.path}</strong>
          <span className={`save-state${props.dirty ? ' dirty' : ''}`}>
            {props.dirty ? 'Unsaved' : 'Saved to local draft'}
          </span>
          {errors.length === 0 ? null : (
            <div className="file-editor-errors" role="status">
              {errors.map(error => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}
        </div>
        <button className="editor-save-button" type="button" disabled={props.saving} onClick={props.onSave}>
          Save to local draft
        </button>
      </div>
      <div className="file-editor-body">
        <div className="editor-card">
          <textarea
            className="code-textarea"
            aria-label={`${props.path} editor`}
            value={props.content}
            onChange={event => props.onChange(event.currentTarget.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

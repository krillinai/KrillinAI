type FilePathBarProps = {
  rootName: string;
  path?: string;
  onRevealDirectory(): void;
  onCopyPath(): void;
};

export function FilePathBar(props: FilePathBarProps) {
  const segments = props.path?.split('/').filter(Boolean) ?? [];

  return (
    <div className="file-path-bar">
      <nav className="file-path-breadcrumbs" aria-label="File path">
        <span>{props.rootName}</span>
        {segments.map((segment) => (
          <span key={`${props.path ?? ''}:${segment}`}>{segment}</span>
        ))}
      </nav>

      <div className="file-path-actions">
        <button className="toolbar-button" type="button" onClick={props.onRevealDirectory} disabled={!props.path}>
          Open containing folder
        </button>
        <button className="toolbar-button" type="button" onClick={props.onCopyPath} disabled={!props.path}>
          Copy path
        </button>
      </div>
    </div>
  );
}

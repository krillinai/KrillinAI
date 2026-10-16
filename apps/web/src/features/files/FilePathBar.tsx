import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
type FilePathBarProps = {
  rootName: string;
  path?: string;
  onRevealDirectory(): void;
  onCopyPath(): void;
};

export function FilePathBar(props: FilePathBarProps) {
  const l = useLocalizedCopy();
  const segments = props.path?.split('/').filter(Boolean) ?? [];

  return (
    <div className="file-path-bar">
      <nav className="file-path-breadcrumbs" aria-label={l("文件路径", "file path")}>
        <span>{props.rootName}</span>
        {segments.map((segment) => (
          <span key={`${props.path ?? ''}:${segment}`}>{segment}</span>
        ))}
      </nav>

      <div className="file-path-actions">
        <button className="toolbar-button" type="button" onClick={props.onRevealDirectory} disabled={!props.path}>
          {l("打开所在目录", "Open the directory")}</button>
        <button className="toolbar-button" type="button" onClick={props.onCopyPath} disabled={!props.path}>
          {l("复制路径", "copy path")}</button>
      </div>
    </div>
  );
}

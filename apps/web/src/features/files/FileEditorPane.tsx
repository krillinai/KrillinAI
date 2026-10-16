import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { WorkspaceFileMeta } from '@opencreator/protocol';
import { FileCode2, FileImage, FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MarkdownRenderer } from '../../components/markdown/MarkdownRenderer.js';
import { HtmlPreview, type HtmlPreviewResources } from './HtmlPreview.js';
import { TextFileEditor } from './TextFileEditor.js';

export type FileEditorPaneProps = {
  meta?: WorkspaceFileMeta;
  content?: string;
  objectUrl?: string;
  dirty?: boolean;
  saving?: boolean;
  loading?: boolean;
  mode?: FileEditorMode;
  toolbar?: 'inline' | 'hidden';
  htmlPreviewResources?: HtmlPreviewResources;
  onOpenExternal?(url: string): void;
  onChange?(value: string): void;
  onSave?(): void;
  onModeChange?(mode: FileEditorMode): void;
  onPreviewError?(error: unknown): void;
  onPreviewReady?(): void;
};

export type FileEditorMode = 'edit' | 'preview';

export function FileEditorPane(props: FileEditorPaneProps) {
  const l = useLocalizedCopy();
  const meta = props.meta;
  const [uncontrolledMode, setUncontrolledMode] = useState<FileEditorMode>(
    () => defaultModeForMeta(props.meta)
  );
  const toolbar = props.toolbar ?? 'inline';
  const defaultMode = useMemo(() => defaultModeForMeta(meta), [
    meta?.editable,
    meta?.kind,
    meta?.mime,
    meta?.name,
    meta?.path
  ]);

  useEffect(() => {
    if (props.mode === undefined) {
      setUncontrolledMode(defaultMode);
    }
  }, [defaultMode, props.mode]);

  if (!meta) {
    return (
      <section className="file-editor-pane" data-toolbar={toolbar} aria-label={l("文件编辑区", "File editing area")}>
        <div className="file-preview file-preview-empty">
          <p>{l("选择一个文件", "Select a file")}</p>
        </div>
      </section>
    );
  }

  const editable = meta.editable;
  const previewable = isPreviewable(meta);
  const currentMode = editable ? props.mode ?? uncontrolledMode : 'preview';
  const setMode = (nextMode: FileEditorMode) => {
    if (props.mode === undefined) {
      setUncontrolledMode(nextMode);
    }
    props.onModeChange?.(nextMode);
  };

  return (
    <section className="file-editor-pane" data-toolbar={toolbar} aria-label={l("文件编辑区", "File editing area")}>
      {toolbar === 'inline' ? (
        <header className="file-editor-toolbar">
          <div className="file-editor-toolbar-main">
            <div className="file-editor-toolbar-title">
              <strong>{meta.name}</strong>
              <span>{meta.path}</span>
            </div>
            {props.dirty ? <span className="dirty-indicator">{l("未保存", "Unsaved")}</span> : null}
          </div>

          <div className="file-editor-toolbar-actions">
            {editable && previewable ? (
              <div className="file-editor-mode-toggle" aria-label={l("文件视图模式", "file view mode")}>
                <button
                  type="button"
                  aria-pressed={currentMode === 'preview'}
                  onClick={() => setMode('preview')}
                >
                  {l("预览", "Preview")}</button>
                <button
                  type="button"
                  aria-pressed={currentMode === 'edit'}
                  onClick={() => setMode('edit')}
                >
                  {l("编辑", "Edit")}</button>
              </div>
            ) : null}

            {editable ? (
              <button
                className="editor-save-button"
                type="button"
                disabled={props.saving || !props.dirty || meta.readonly}
                onClick={() => props.onSave?.()}
              >
                {l("保存", "Save")}</button>
            ) : null}
          </div>
        </header>
      ) : null}

      {props.loading ? <div className="file-loading-bar" role="status">{l("正在加载文件...", "Loading files...")}</div> : null}

      {renderContent(l, {
        meta,
        mode: currentMode,
        content: props.content ?? '',
        objectUrl: props.objectUrl,
        htmlPreviewResources: props.htmlPreviewResources,
        onOpenExternal: props.onOpenExternal,
        onPreviewError: props.onPreviewError,
        onPreviewReady: props.onPreviewReady,
        onChange: props.onChange,
        onSave: props.onSave
      })}
    </section>
  );
}

type RenderContentArgs = {
  meta: WorkspaceFileMeta;
  mode: FileEditorMode;
  content: string;
  objectUrl?: string;
  htmlPreviewResources?: HtmlPreviewResources;
  onOpenExternal?: (url: string) => void;
  onPreviewError?: (error: unknown) => void;
  onPreviewReady?: () => void;
  onChange?: (value: string) => void;
  onSave?: () => void;
};

function renderContent(l: LocalizeCopy, args: RenderContentArgs) {
  if (isImagePreview(args.meta)) {
    return (
      <div className="file-preview file-preview-media">
        {args.objectUrl ? <img src={args.objectUrl} alt={args.meta.name} /> : <p>{l("图片预览不可用", "Image preview not available")}</p>}
      </div>
    );
  }

  if (args.meta.kind === 'pdf') {
    return (
      <div className="file-preview file-preview-media">
        {args.objectUrl ? (
          <object data={args.objectUrl} type="application/pdf" title={l(`${args.meta.name} PDF 预览`, `${args.meta.name} PDF preview`)} aria-label={l(`${args.meta.name} PDF 预览`, `${args.meta.name} PDF preview`)} />
        ) : (
          <p>{l("PDF 预览不可用", "PDF preview not available")}</p>
        )}
      </div>
    );
  }

  if (isTextLike(args.meta)) {
    if (args.mode === 'preview') {
      return renderTextPreview(l,
        args.meta,
        args.content,
        args.htmlPreviewResources,
        args.onOpenExternal,
        args.onPreviewError,
        args.onPreviewReady
      );
    }

    return (
      <TextFileEditor
        path={args.meta.path}
        kind={args.meta.kind}
        content={args.content}
        readonly={args.meta.readonly}
        onChange={args.onChange}
        onSave={args.onSave}
      />
    );
  }

  return renderUnsupported(l, args.meta);
}

function renderTextPreview(l: LocalizeCopy,
  meta: WorkspaceFileMeta,
  content: string,
  htmlPreviewResources?: HtmlPreviewResources,
  onOpenExternal?: (url: string) => void,
  onPreviewError?: (error: unknown) => void,
  onPreviewReady?: () => void
) {
  if (meta.kind === 'html') {
    return (
      <HtmlPreview
        name={meta.name}
        path={meta.path}
        content={content}
        resources={htmlPreviewResources}
        onOpenExternal={onOpenExternal}
        onError={onPreviewError}
        onReady={onPreviewReady}
      />
    );
  }

  if (meta.kind === 'markdown') {
    return (
      <div className="file-preview">
        <MarkdownRenderer text={content} variant="document" />
      </div>
    );
  }

  if (meta.kind === 'json') {
    return <JsonPreview content={content} />;
  }

  return (
    <div className="file-preview">
      <pre>{content}</pre>
    </div>
  );
}

function JsonPreview(props: { content: string }) {
  const l = useLocalizedCopy();
  const parsed = useMemo(() => {
    try {
      return {
        ok: true as const,
        text: JSON.stringify(JSON.parse(props.content), null, 2)
      };
    } catch {
      return {
        ok: false as const,
        text: props.content
      };
    }
  }, [props.content]);

  return (
    <div className="file-preview">
      {parsed.ok ? null : <p className="file-preview-note">{l("JSON 解析失败，以下保留原始内容。", "JSON parsing failed, original content retained below.")}</p>}
      <pre>{parsed.text}</pre>
    </div>
  );
}

function renderUnsupported(l: LocalizeCopy, meta: WorkspaceFileMeta) {
  return (
    <div className="unsupported-file-state">
      <div className="unsupported-file-state-icon" aria-hidden="true">
        {unsupportedIcon(meta)}
      </div>
      <div className="unsupported-file-state-copy">
        <strong>{l('暂不支持预览此文件', 'Preview is not supported for this file yet')}</strong>
        <span>{meta.name}</span>
        <span>{meta.mime}</span>
        <span>{formatSize(meta.size)}</span>
        <p>{meta.reason ?? l('该文件当前既不可编辑，也没有可用预览。', 'This file cannot be edited and has no available preview.')}</p>
      </div>
    </div>
  );
}

function unsupportedIcon(meta: WorkspaceFileMeta) {
  if (meta.kind === 'image') {
    return <ImageIcon size={18} strokeWidth={2} />;
  }

  if (meta.kind === 'binary' || meta.kind === 'pdf') {
    return <FileImage size={18} strokeWidth={2} />;
  }

  if (isTextLike(meta)) {
    return <FileCode2 size={18} strokeWidth={2} />;
  }

  return <FileText size={18} strokeWidth={2} />;
}

function isTextLike(meta: WorkspaceFileMeta): boolean {
  if (meta.type !== 'file') {
    return false;
  }

  return meta.kind === 'markdown' || meta.kind === 'text' || meta.kind === 'json' || meta.kind === 'code' || meta.kind === 'html' || isSvgSource(meta);
}

export function isPreviewable(meta: WorkspaceFileMeta): boolean {
  if (
    meta.kind === 'markdown' ||
    meta.kind === 'json' ||
    meta.kind === 'text' ||
    meta.kind === 'code' ||
    meta.kind === 'html' ||
    isSvgSource(meta)
  ) {
    return true;
  }

  return meta.kind === 'image' || meta.kind === 'pdf';
}

function isImagePreview(meta: WorkspaceFileMeta): boolean {
  return meta.kind === 'image' && !isSvgSource(meta);
}

function isSvgSource(meta: WorkspaceFileMeta): boolean {
  return meta.name.toLowerCase().endsWith('.svg') || meta.mime === 'image/svg+xml';
}

export function defaultModeForMeta(meta?: WorkspaceFileMeta): FileEditorMode {
  if (!meta) {
    return 'edit';
  }

  if (isSvgSource(meta) && meta.editable) {
    return 'edit';
  }

  if (meta.kind === 'html') {
    return 'preview';
  }

  if (!meta.editable || meta.kind === 'image' || meta.kind === 'pdf') {
    return 'preview';
  }

  return 'edit';
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

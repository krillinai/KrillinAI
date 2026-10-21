import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CreatorSubtitlePreviewRequest } from '@opencreator/protocol';
import type { CreatorWebService } from '../../services/creator-service.js';
import SubtitleCompositionPreview from './SubtitleCompositionPreview.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';

export default function VideoTranslationStylePreview(props: {
  input: CreatorSubtitlePreviewRequest;
  render?: CreatorWebService['openSubtitlePreview'];
  prepare?: CreatorWebService['prepareSubtitleRender'];
  openFont?: CreatorWebService['openSubtitleFont'];
  horizontal?: boolean;
  majorTitle?: string;
  minorTitle?: string;
}) {
  const l = useLocalizedCopy();
  const key = JSON.stringify(props.input);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<{ key: string; url?: string; failed?: boolean }>();
  useEffect(() => {
    if (props.prepare && props.openFont) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (props.render === undefined) throw new Error('Subtitle renderer is unavailable');
          const response = await props.render(JSON.parse(key) as CreatorSubtitlePreviewRequest, { signal: controller.signal });
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) {
            throw new Error('Invalid subtitle preview');
          }
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setPreview({ key, url: objectUrl });
        } catch {
          if (!controller.signal.aborted) setPreview({ key, failed: true });
        }
      })();
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [key, props.render, props.prepare, props.openFont, retry]);
  const current = preview?.key === key ? preview : undefined;
  if (props.prepare && props.openFont) return <SubtitleCompositionPreview prepare={props.prepare} openFont={props.openFont} time={0.5}
    input={{ width: props.input.width, height: props.input.height, horizontal: props.horizontal ?? props.input.width >= props.input.height,
      majorTitle: props.majorTitle, minorTitle: props.minorTitle,
      bilingual: props.input.bilingual, subtitlePosition: props.input.subtitlePosition, subtitleStyle: props.input.subtitleStyle,
      cues: [{ startMs: 0, endMs: 1000, text: props.input.translationText, sourceText: props.input.originalText }] }} />;
  if (current?.url !== undefined) {
    return <img className="video-translation-subtitle-rendered-preview" src={current.url} alt={l('字幕样式预览', 'Subtitle style preview')} />;
  }
  return <div className="video-translation-subtitle-preview-status" role="status">
    <span>{current?.failed ? l('字幕预览加载失败', 'Subtitle preview failed') : l('正在生成字幕预览...', 'Rendering subtitle preview...')}</span>
    {current?.failed ? <button type="button" title={l('重试', 'Retry')} aria-label={l('重试字幕预览', 'Retry subtitle preview')} onClick={() => { setPreview(undefined); setRetry(value => value + 1); }}><RefreshCw size={16} /></button> : null}
  </div>;
}

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CreatorSubtitleRenderRequest } from '@opencreator/protocol';
import type { CreatorWebService } from '../../services/creator-service.js';
import type JASSUB from 'jassub';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';

const fontCache = new Map<string, Promise<Uint8Array>>();

export default function SubtitleCompositionPreview(props: {
  input: CreatorSubtitleRenderRequest;
  prepare: CreatorWebService['prepareSubtitleRender'];
  openFont: CreatorWebService['openSubtitleFont'];
  videoRef?: RefObject<HTMLVideoElement>;
  time?: number;
}) {
  const l = useLocalizedCopy();
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<JASSUB>();
  const revision = useRef(0);
  const updates = useRef(Promise.resolve());
  const canvasSize = useRef({ width: props.input.width, height: props.input.height });
  const loadedFonts = useRef(new Set<string>());
  const latest = useRef(props); latest.current = props;
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(props.input);
  const draw = async (force = false, time?: number) => {
    const instance = renderer.current;
    if (!instance) return;
    const { videoRef } = latest.current;
    await instance.manualRender({ ...canvasSize.current,
      mediaTime: time ?? videoRef?.current?.currentTime ?? latest.current.time ?? 0,
      expectedDisplayTime: performance.now() }, force);
  };

  useEffect(() => { void draw(true).catch(() => setStatus('failed')); }, [props.time]);

  useEffect(() => {
    const video = props.videoRef?.current;
    if (!video) return;
    let active = true;
    let frame: number | undefined;
    let animation: number | undefined;
    const repaint = () => { void draw(true).catch(() => { if (active) setStatus('failed'); }); };
    const nextFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!active) return;
      void draw(false, metadata.mediaTime).catch(() => { if (active) setStatus('failed'); });
      frame = video.requestVideoFrameCallback(nextFrame);
    };
    const fallbackFrame = () => {
      if (!active) return;
      if (!video.paused) void draw().catch(() => setStatus('failed'));
      animation = requestAnimationFrame(fallbackFrame);
    };
    if (typeof video.requestVideoFrameCallback === 'function') frame = video.requestVideoFrameCallback(nextFrame);
    else animation = requestAnimationFrame(fallbackFrame);
    for (const event of ['seeked', 'loadeddata', 'pause', 'ratechange']) video.addEventListener(event, repaint);
    return () => {
      active = false;
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      if (animation !== undefined) cancelAnimationFrame(animation);
      for (const event of ['seeked', 'loadeddata', 'pause', 'ratechange']) video.removeEventListener(event, repaint);
    };
  }, [props.videoRef]);

  useEffect(() => {
    const ownRevision = ++revision.current;
    let canceled = false;
    setStatus('loading');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const bundle = await props.prepare(JSON.parse(key) as CreatorSubtitleRenderRequest);
          if (canceled) return;
          const fonts = await Promise.all(bundle.fonts.map(font => {
            let pending = fontCache.get(font.sha256);
            if (!pending) {
              pending = props.openFont(font.id).then(async response => {
                if (!response.ok) throw new Error('Subtitle font is unavailable');
                const bytes = new Uint8Array(await response.arrayBuffer());
                const hash = await crypto.subtle.digest('SHA-256', bytes);
                if (Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('') !== font.sha256) throw new Error('Subtitle font changed');
                return bytes;
              }).catch(error => { fontCache.delete(font.sha256); throw error; });
              fontCache.set(font.sha256, pending);
              while (fontCache.size > 24) fontCache.delete(fontCache.keys().next().value!);
            }
            return pending;
          }));
          if (canceled || ownRevision !== revision.current || !host.current) return;
          // Serialize worker mutations: a late style response must never
          // replace a newer track or race an instance being initialized.
          const update = updates.current.catch(() => {}).then(async () => {
            if (canceled || ownRevision !== revision.current || !host.current) return;
            let instance = renderer.current;
            if (!instance) {
              const { createSubtitleRenderer } = await import('./subtitle-renderer.js');
              if (canceled || !host.current) return;
              const canvas = document.createElement('canvas');
              canvas.className = 'subtitle-composition-canvas';
              canvas.style.width = `${bundle.width}px`; canvas.style.height = `${bundle.height}px`;
              host.current.append(canvas);
              instance = await createSubtitleRenderer(canvas, bundle.ass, fonts, bundle.width, bundle.height);
              if (canceled || ownRevision !== revision.current) { await instance.destroy(); return; }
              renderer.current = instance;
              loadedFonts.current = new Set(bundle.fonts.map(font => font.sha256));
            } else {
              const additions = fonts.filter((_font, index) => !loadedFonts.current.has(bundle.fonts[index]!.sha256));
              if (additions.length) await instance.renderer.addFonts(additions.map(font => font.slice()));
              for (const font of bundle.fonts) loadedFonts.current.add(font.sha256);
              if (canceled || ownRevision !== revision.current) return;
              await instance.renderer.setTrack(bundle.ass);
            }
            if (canceled || ownRevision !== revision.current || !host.current) return;
            host.current.dataset.renderHash = bundle.contentHash;
            const canvas = host.current.querySelector('canvas');
            if (canvas) { canvas.style.width = `${bundle.width}px`; canvas.style.height = `${bundle.height}px`; }
            const resize = () => {
              if (!host.current || !canvas) return;
              const scale = Math.min(host.current.clientWidth / bundle.width, host.current.clientHeight / bundle.height);
              canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
            };
            resize();
            canvasSize.current = { width: bundle.width, height: bundle.height };
            await instance.resize(false, bundle.width, bundle.height);
            await draw(true);
            if (!canceled) setStatus('ready');
          });
          updates.current = update;
          await update;
        } catch {
          if (!canceled && ownRevision === revision.current) {
            const broken = renderer.current;
            renderer.current = undefined;
            loadedFonts.current.clear();
            void broken?.destroy().catch(() => {});
            host.current?.querySelectorAll('canvas').forEach(canvas => canvas.remove());
            setStatus('failed');
          }
        }
      })();
    }, 60);
    return () => { canceled = true; clearTimeout(timer); };
  }, [key, props.prepare, props.openFont, retry]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const canvas = element.querySelector('canvas');
      if (!canvas) return;
      const scale = Math.min(element.clientWidth / parseFloat(canvas.style.width), element.clientHeight / parseFloat(canvas.style.height));
      canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
    });
    observer.observe(element);
    return () => { observer.disconnect(); ++revision.current; const instance = renderer.current; renderer.current = undefined; void instance?.destroy().catch(() => {}); };
  }, []);

  return <div ref={host} className="subtitle-composition-preview" data-status={status} aria-label={l('字幕样式预览', 'Subtitle style preview')}>
    {status !== 'ready' ? <div className="video-translation-subtitle-preview-status" role="status">
      <span>{status === 'failed' ? l('字幕预览加载失败', 'Subtitle preview failed') : l('正在生成字幕预览...', 'Rendering subtitle preview...')}</span>
      {status === 'failed' ? <button type="button" onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>{l('重试', 'Retry')}</button> : null}
    </div> : null}
  </div>;
}

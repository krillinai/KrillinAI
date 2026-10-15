import { LoaderCircle, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { GatewayModel, VideoGenerationReference } from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useOptionalCreatorSession } from './creator-session-store.js';

export function readVideoReferences(value: unknown): VideoGenerationReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((ref): ref is VideoGenerationReference => !!ref && typeof ref === 'object'
    && ['image','video','audio','firstFrame','lastFrame'].includes(ref.role)
    && typeof ref.assetId === 'string' && /^ocasset_[a-f0-9]{48}$/.test(ref.assetId) && typeof ref.fileName === 'string');
}

export function videoReferenceIssue(model: GatewayModel | undefined, refs: VideoGenerationReference[], legacyImage = false): 'limits' | 'frames' | 'mixed' | 'audio' | undefined {
  const options = model?.videoOptions;
  if (!options) return refs.length ? 'limits' : undefined;
  const count = (role: VideoGenerationReference['role']) => refs.filter(ref => ref.role === role).length;
  const images = count('image') + Number(legacyImage);
  const frames = count('firstFrame') + count('lastFrame');
  if (images > options.maxImages || count('video') > options.maxVideos || count('audio') > options.maxAudios || count('firstFrame') > 1 || count('lastFrame') > 1 || frames && !options.firstLastFrames) return 'limits';
  if (count('lastFrame') && !count('firstFrame')) return 'frames';
  if (frames && options.framesExclusive && images + count('video') + count('audio') > 0) return 'mixed';
  if (frames && images && ['google', 'wan'].includes(options.profile)) return 'mixed';
  if (options.profile === 'kling' && images + frames > options.maxImages || options.profile === 'sd' && images + count('video') + count('audio') > 12) return 'limits';
  if (options.profile === 'minimax' && count('audio') && !images) return 'audio';
  if (options.profile === 'omni' && count('video') === 1 && !images) return 'mixed';
  return undefined;
}

export default function OfficialVideoReferences(props: {
  model: GatewayModel; references: VideoGenerationReference[]; disabled: boolean;
  onBusyChange(busy: boolean): void; onError(message: string): void;
}) {
  const l = useLocalizedCopy();
  const session = useOptionalCreatorSession();
  const [uploading, setUploading] = useState(false);
  const options = props.model.videoOptions!;
  const imageAccept = options.profile === 'google' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,image/webp';
  const frames = !!options.firstLastFrames && session?.state.videoReferenceMode === 'frames' || props.references.some(ref => ref.role === 'firstFrame' || ref.role === 'lastFrame');
  const roles: Array<{ role: VideoGenerationReference['role']; label: string; limit: number; accept: string; maxBytes: number }> = frames ? [
    { role: 'firstFrame', label: l('首帧', 'First frame'), limit: 1, accept: imageAccept, maxBytes: 5 * 1024 * 1024 },
    { role: 'lastFrame', label: l('尾帧', 'Last frame'), limit: 1, accept: imageAccept, maxBytes: 5 * 1024 * 1024 }
  ] : [
    { role: 'image', label: l('参考图片', 'Reference images'), limit: options.maxImages, accept: imageAccept, maxBytes: 5 * 1024 * 1024 },
    { role: 'video', label: l('参考视频', 'Reference videos'), limit: options.maxVideos, accept: 'video/mp4,video/webm,video/quicktime', maxBytes: 50_000_000 },
    { role: 'audio', label: l('参考音频', 'Reference audio'), limit: options.maxAudios, accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac', maxBytes: 15_000_000 }
  ];
  const disabled = props.disabled || uploading;

  async function upload(files: File[], role: typeof roles[number]) {
    if (!session?.uploadVideoReference || disabled || !files.length) return;
    const selected = props.references.filter(ref => ref.role === role.role);
    if (files.length + selected.length > role.limit) { props.onError(l(`最多添加 ${role.limit} 个${role.label}`, `Maximum ${role.limit} files for ${role.label.toLowerCase()}`)); return; }
    if (files.some(file => !role.accept.split(',').includes(file.type) || file.size < 1 || file.size > role.maxBytes)) {
      props.onError(l(`文件格式不支持或超过 ${Math.floor(role.maxBytes / 1_000_000)}MB`, `Unsupported file format or file exceeds ${Math.floor(role.maxBytes / 1_000_000)} MB`)); return;
    }
    setUploading(true); props.onBusyChange(true); props.onError('');
    let next = [...props.references];
    try {
      for (const file of files) {
        const receipt = await session.uploadVideoReference(file);
        next = [...next, { role: role.role, fileName: file.name, assetId: receipt.assetId }];
        session.updateDraft({ videoReferences: next }, { semantic: true });
      }
    } catch (error) {
      session.captureCreatorFailure('video-generation.upload-reference', error, l('参考素材上传失败，请重试', 'Reference upload failed. Retry.'), 'upload');
    } finally { setUploading(false); props.onBusyChange(false); }
  }

  function setMode(nextFrames: boolean) {
    session?.updateDraft({ videoReferenceMode: nextFrames ? 'frames' : 'references', videoReferences: [] }, { semantic: true });
  }

  return <div className="official-video-references">
    {options.firstLastFrames || frames ? <div className="official-video-modes" role="group" aria-label={l('参考模式', 'Reference mode')}>
      <button type="button" aria-pressed={!frames} disabled={disabled} onClick={() => setMode(false)}>{l('参考素材', 'References')}</button>
      <button type="button" aria-pressed={frames} disabled={disabled || !options.firstLastFrames} onClick={() => setMode(true)}>{l('首尾帧', 'First and last frames')}</button>
    </div> : null}
    <div className="official-video-reference-fields">
      {roles.filter(role => role.limit > 0 || props.references.some(ref => ref.role === role.role)).map(role => <div className="official-video-reference-field" key={role.role}>
        <span>{role.label} <small>{props.references.filter(ref => ref.role === role.role).length}/{role.limit}</small></span>
        <ul>{props.references.filter(ref => ref.role === role.role).map(ref => <li key={ref.assetId}>
          <span title={ref.fileName}>{ref.fileName}</span>
          <button type="button" title={l('移除素材', 'Remove reference')} aria-label={l(`移除 ${ref.fileName}`, `Remove ${ref.fileName}`)} disabled={disabled}
            onClick={() => session?.updateDraft({ videoReferences: props.references.filter(item => item.assetId !== ref.assetId) }, { semantic: true })}><X size={14} /></button>
        </li>)}</ul>
        <label className="official-video-reference-add" aria-disabled={disabled || !session?.uploadVideoReference || props.references.filter(ref => ref.role === role.role).length >= role.limit}>
          <input type="file" accept={role.accept} multiple={role.limit > 1} disabled={disabled || !session?.uploadVideoReference || props.references.filter(ref => ref.role === role.role).length >= role.limit}
            aria-label={l(`上传${role.label}`, `Upload ${role.label.toLowerCase()}`)} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files, role); }} />
          {uploading ? <LoaderCircle size={15} className="smart-dubbing-spinner" /> : <Plus size={15} />}
          {l('添加', 'Add')}
        </label>
      </div>)}
    </div>
  </div>;
}

import type { VideoMetadataResponse } from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { OriginalErrorDetails } from '../issues/OriginalErrorDetails.js';

export function BilibiliPartSelector(props: {
  metadata?: VideoMetadataResponse;
  error?: string;
  onRetry?(): void;
  onSelect(index: number): void;
}) {
  const l = useLocalizedCopy();
  if (props.error) {
    return (
      <div className="video-translation-run-notice is-error" role="alert">
        <p>{l('无法读取或确认 B 站视频分集，请检查链接和分 P 参数后重试。', 'Could not load or verify Bilibili parts. Check the video URL and part parameter, then retry.', 'Det gick inte att läsa in eller verifiera Bilibili-delar. Kontrollera videolänken och delparametern och försök igen.')}</p>
        <OriginalErrorDetails detail={props.error} />
        {props.onRetry ? <button className="video-translation-secondary-action" type="button" onClick={props.onRetry}>
          {l('重新读取分集', 'Retry loading parts')}
        </button> : <a href="#/settings?tab=diagnostics">{l('查看连接诊断', 'Open connection diagnostics')}</a>}
      </div>
    );
  }
  if (props.metadata === undefined) {
    return <p className="video-translation-run-notice" role="status">{l('正在读取 B 站分集信息，请稍候…', 'Loading Bilibili parts, please wait…')}</p>;
  }
  const parts = props.metadata.parts ?? [];
  if (parts.length < 2) return null;
  return (
    <div className="video-translation-bilibili-parts">
      <label className="video-translation-field">
        <span>{l('选择要翻译的分集', 'Choose a part to translate')}</span>
        <select value={props.metadata.selectedPart?.index ?? ''} onChange={event => props.onSelect(Number(event.target.value))}>
          <option value="" disabled>{l('请选择分集', 'Select a part')}</option>
          {parts.map(part => <option key={part.index} value={part.index}>P{part.index} · {part.title}</option>)}
        </select>
      </label>
      <p role="status">{l(`共 ${parts.length} 个分 P，只翻译选中的分集，不会下载整个合集。`, `${parts.length} parts. Only the selected part is translated; the entire collection will not be downloaded.`, `${parts.length} delar. Endast den valda delen översätts; hela samlingen laddas inte ned.`)}</p>
    </div>
  );
}

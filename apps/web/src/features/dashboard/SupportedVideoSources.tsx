import { useId, useState } from 'react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';

export default function SupportedVideoSources(props: { compact?: boolean }) {
  const l = useLocalizedCopy();
  const tooltipId = useId();
  const [activePlatform, setActivePlatform] = useState<string>();
  return (
    <div className={`video-download-platform-section${props.compact ? ' video-source-platforms-compact' : ''}`}>
      <span>{props.compact ? l('支持平台', 'Supported platforms')
        : l('支持的视频来源（支持单个公开视频链接）', 'Supported video sources (one public video link)')}</span>
      <ul className="video-download-platforms" aria-label={l('支持的平台', 'Supported platforms')}>
        {([
          ['youtube', 'YouTube'], ['bilibili', 'Bilibili'], ['x', 'X'],
          ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['douyin', l('抖音', 'Douyin')],
          ['facebook', 'Facebook'], ['xiaohongshu', l('小红书', 'Xiaohongshu')], ['pinterest', 'Pinterest']
        ] as const).map(([platform, name]) => (
          <li
            key={platform}
            onMouseEnter={props.compact ? () => setActivePlatform(platform) : undefined}
            onMouseLeave={props.compact ? event => {
              if (!event.currentTarget.contains(document.activeElement)) setActivePlatform(undefined);
            } : undefined}
          >
            {props.compact ? (
              <>
                <span
                  className="video-source-platform-mark"
                  role="img"
                  aria-label={name}
                  aria-describedby={`${tooltipId}-${platform}`}
                  tabIndex={0}
                  onFocus={() => setActivePlatform(platform)}
                  onBlur={() => setActivePlatform(undefined)}
                  onPointerDown={event => event.currentTarget.focus()}
                  onKeyDown={event => {
                    if (event.key === 'Escape') setActivePlatform(undefined);
                  }}
                >
                  <img src={`/platforms/${platform}.${platform === 'pinterest' ? 'svg' : 'png'}`} alt="" width="20" height="20" />
                </span>
                <span id={`${tooltipId}-${platform}`} className="video-source-platform-tooltip" role="tooltip" hidden={activePlatform !== platform}>
                  {name}
                </span>
              </>
            ) : (
              <>
                <img src={`/platforms/${platform}.${platform === 'pinterest' ? 'svg' : 'png'}`} alt="" width="32" height="32" />
                <span>{name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

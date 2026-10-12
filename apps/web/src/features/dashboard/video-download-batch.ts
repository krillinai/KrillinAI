import {
  normalizeVideoSourceUrl,
  supportedVideoSourcePlatform,
  videoSourceIdentity,
  type CreatorJob
} from '@opencreator/protocol';

export const DOWNLOAD_BATCH_PARENT = 'downloadBatchId';
export const DOWNLOAD_BATCH_HIDDEN = 'downloadBatchHiddenJobIds';

export type DownloadSource = {
  id: string;
  job: CreatorJob;
  url: string;
  title: string;
  thumbnail?: string;
  thumbnailArtifactId?: string;
  status: 'waiting' | 'analyzing' | 'ready' | 'downloading' | 'completed' | 'failed' | 'canceled';
  percent?: number;
};

export function downloadSourceIdentity(value: string): string {
  const normalized = normalizeVideoSourceUrl(value);
  return videoSourceIdentity(normalized) ?? normalized;
}

export function parseDownloadLink(value: string): { url: string; error?: never } | { error: 'multiple' | 'invalid'; url?: never } {
  // Check before normalization, which can extract a single URL from share text.
  if ((value.match(/[a-z][a-z\d+.-]*:\/\//gi) ?? []).length > 1) return { error: 'multiple' };
  const url = normalizeVideoSourceUrl(value);
  return supportedVideoSourcePlatform(url) === null ? { error: 'invalid' } : { url };
}

export function downloadSourceForJob(job: CreatorJob): DownloadSource | undefined {
  const url = typeof job.state.sourceUrl === 'string' ? job.state.sourceUrl.trim() : '';
  if (!url) return undefined;
  const probe = [...job.artifacts].reverse().find(artifact => (
    artifact.kind === 'download_probe'
    && artifact.status === 'completed'
    && typeof artifact.metadata.requestedUrl === 'string'
    && downloadSourceIdentity(artifact.metadata.requestedUrl) === downloadSourceIdentity(url)
  ));
  const active = job.stages.filter(stage => stage.status === 'queued' || stage.status === 'running');
  const downloading = active.find(stage => stage.stageId === 'download');
  const latest = job.stages.at(-1);
  const completed = job.artifacts.some(artifact => artifact.status === 'completed'
    && (artifact.kind === 'source_video' || artifact.kind === 'source_audio'));
  return {
    id: job.id, job, url,
    title: typeof probe?.metadata.title === 'string' ? probe.metadata.title : url,
    ...(typeof probe?.metadata.thumbnailUrl === 'string' ? { thumbnail: probe.metadata.thumbnailUrl, thumbnailArtifactId: probe.id } : {}),
    status: downloading !== undefined ? 'downloading'
      : active.some(stage => stage.stageId === 'probe') ? 'analyzing'
        : latest?.status === 'failed' ? 'failed'
          : latest?.status === 'canceled' || latest?.status === 'interrupted' ? 'canceled'
            : completed ? 'completed' : probe !== undefined ? 'ready' : 'waiting',
    ...(typeof downloading?.progress.percent === 'number'
      ? { percent: Math.min(100, Math.max(0, downloading.progress.percent)) } : {})
  };
}

export function hiddenDownloadJobIds(job: CreatorJob): string[] {
  const value = job.state[DOWNLOAD_BATCH_HIDDEN];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

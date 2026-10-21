import {
  readCreatorResultSnapshots,
  videoSourceIdentity,
  type CreatorJob,
  type CreatorJson,
  type CreatorStageRun
} from '@opencreator/protocol';

export function isBackgroundSourceDownload(stage: CreatorStageRun): boolean {
  return stage.stageId === 'preview-source-video' && stage.progress.backgroundSourceDownload === true;
}

// Either the subtitles or the download may finish first. Only fill media refs for
// snapshots of the same source, without changing their settings or version.
export function attachDownloadedTranslationSource(job: CreatorJob): Record<string, CreatorJson> {
  if (job.templateId !== 'video-translation') return {};
  let changed = false;
  const snapshots = readCreatorResultSnapshots(job.state.resultSnapshots).map(snapshot => {
    if (snapshot.state.sourceType !== 'url' || typeof snapshot.state.sourceUrl !== 'string') return snapshot;
    const identity = videoSourceIdentity(snapshot.state.sourceUrl);
    if (identity === null) return snapshot;
    const sourceIdentity = (artifact: CreatorJob['artifacts'][number]) => {
      const settings = artifact.metadata.settingsSnapshot;
      const url = settings && typeof settings === 'object' && !Array.isArray(settings)
        ? settings.sourceUrl ?? artifact.metadata.sourceUrl : artifact.metadata.sourceUrl;
      return typeof url === 'string' ? videoSourceIdentity(url) : null;
    };
    const matches = (artifact: CreatorJob['artifacts'][number]) => artifact.kind === 'source_video'
      && artifact.status === 'completed' && artifact.path !== null
      && artifact.metadata.playbackCompatible !== false && sourceIdentity(artifact) === identity;
    if (job.artifacts.some(artifact => (snapshot.artifactRefs.source_video ?? []).includes(artifact.id) && matches(artifact))) return snapshot;
    const source = [...job.artifacts].reverse().find(matches);
    if (!source) {
      const refs = snapshot.artifactRefs.source_video ?? [];
      const staleSource = job.artifacts.some(artifact => refs.includes(artifact.id)
        && (artifact.metadata.playbackCompatible === false
          || (sourceIdentity(artifact) !== null && sourceIdentity(artifact) !== identity)));
      if (!staleSource) return snapshot;
      changed = true;
      const { source_video: _oldSource, ...artifactRefs } = snapshot.artifactRefs;
      return { ...snapshot, artifactRefs };
    }
    changed = true;
    return { ...snapshot, artifactRefs: { ...snapshot.artifactRefs, source_video: [source.id] } };
  });
  return changed ? { resultSnapshots: snapshots as CreatorJson } : {};
}

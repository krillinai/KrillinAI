import {
  readCreatorResultSnapshots,
  type CreatorArtifact,
  type CreatorJson,
  type CreatorStageRun
} from '@opencreator/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Download,
  FileVideo,
  LayoutGrid,
  List,
  ListVideo,
  LoaderCircle,
  Play,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { VideoMetadataService } from '../../services/video-metadata-service.js';
import CreatorResultVersionMenu from './CreatorResultVersionMenu.js';
import CreatorTaskSummary from './CreatorTaskSummary.js';
import CreatorToolShell from './CreatorToolShell.js';
import { useOptionalCreatorSession } from './creator-session-store.js';
import VideoSourceInput from './VideoSourceInput.js';

type AutoClipStep = 0 | 1 | 2;
type AutoClipResultTab = 'candidates' | 'details' | 'export' | 'settings';
type AutoClipLayout = 'grid' | 'list';
type VideoOrientation = 'landscape' | 'portrait';
type AnalysisFocus = 'balanced' | 'viral' | 'knowledge';
type ClipDuration = '15-30' | '30-60' | '60-90';
type ClipAspectRatio = 'source' | '16:9' | '9:16' | '1:1';
type ClipScoreKey = 'hook' | 'information' | 'emotion' | 'completeness';

type ClipCandidate = {
  id: string;
  title: string;
  start: number;
  end: number;
  transcript: string;
  reason: string;
  scores: Record<ClipScoreKey, number>;
};

type AutoClipResultVersion = {
  value: number;
  description: string;
  state: Record<string, CreatorJson>;
  artifact: CreatorArtifact;
  sourceArtifact?: CreatorArtifact;
  candidates: ClipCandidate[];
};

const analysisStageIds = new Set(['probe', 'download', 'subtitle', 'analyze']);

export default function AutoClipWorkspace(props: {
  onBack(): void;
  promptHint?: string;
  videoMetadataService?: VideoMetadataService;
}) {
  const l = useLocalizedCopy();
  const session = useOptionalCreatorSession();
  const draftInitializedRef = useRef(false);
  const initializedSelectionVersionRef = useRef<number>();
  const [videoUrl, setVideoUrl] = useState(() => readString(session?.state.sourceUrl));
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [sourceArtifactId, setSourceArtifactId] = useState(() => readString(session?.state.sourceArtifactId));
  const [focus, setFocus] = useState<AnalysisFocus>(() => readFocus(session?.state.focus));
  const [duration, setDuration] = useState<ClipDuration>(() => readDuration(session?.state.duration));
  const [clipCount, setClipCount] = useState(() => readClipCount(session?.state.clipCount));
  const [aspectRatio, setAspectRatio] = useState<ClipAspectRatio>(() => readAspectRatio(session?.state.aspectRatio));
  const [sourceOrientation, setSourceOrientation] = useState<VideoOrientation>('landscape');
  const [activeClipId, setActiveClipId] = useState('');
  const [selected, setSelected] = useState<string[]>(() => readStringArray(session?.state.selectedCandidateIds));
  const [sort, setSort] = useState<'score' | 'time'>('score');
  const [clipLayout, setClipLayout] = useState<AutoClipLayout>('grid');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState<AutoClipStep>(0);
  const [furthestStep, setFurthestStep] = useState<AutoClipStep>(0);
  const [resultTab, setResultTab] = useState<AutoClipResultTab>('candidates');
  const [resultVersion, setResultVersion] = useState<number>();
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');
  const [exportUrls, setExportUrls] = useState<Record<string, string>>({});
  const resultVersions = useMemo(
    () => createAutoClipResultVersions(
      session?.job.artifacts ?? [],
      session?.state.resultSnapshots
    ),
    [session?.job.artifacts, session?.state.resultSnapshots]
  );
  const latestVersion = resultVersions.at(-1)?.value;
  const selectedResult = resultVersions.find(version => version.value === resultVersion)
    ?? resultVersions.at(-1);
  const candidates = selectedResult?.candidates ?? [];
  const orderedClips = useMemo(() => [...candidates].sort(sort === 'score'
    ? (left, right) => totalScore(right) - totalScore(left)
    : (left, right) => left.start - right.start), [candidates, sort]);
  const currentClip = candidates.find(clip => clip.id === activeClipId) ?? candidates[0];
  const importedSourceArtifact = findArtifact(
    session?.job.artifacts ?? [],
    sourceArtifactId,
    'source_video'
  );
  const currentSourceArtifact = selectedResult?.sourceArtifact
    ?? importedSourceArtifact
    ?? latestCompletedArtifact(session?.job.artifacts ?? [], 'source_video');
  const importedSourceName = artifactFileName(currentSourceArtifact)
    || l('项目视频', 'Project video');
  const hasSource = importedSourceArtifact !== undefined
    || videoFile !== null
    || isValidUrl(videoUrl);
  const latestAnalysisStage = latestStage(session?.job.stages ?? [], analysisStageIds);
  const latestRenderStage = latestStage(session?.job.stages ?? [], new Set(['render']));
  const analyzing = latestAnalysisStage?.status === 'queued' || latestAnalysisStage?.status === 'running';
  const exporting = latestRenderStage?.status === 'queued' || latestRenderStage?.status === 'running';
  const runtimeError = latestFailedStage(session?.job.stages ?? []);
  const visibleError = error || formatClipError(runtimeError ?? session?.error, l);
  const exportedArtifacts = useMemo(
    () => selectedResult === undefined
      ? []
      : latestExportsForCandidateArtifact(
          session?.job.artifacts ?? [],
          selectedResult.artifact.id
        ),
    [selectedResult?.artifact.id, session?.job.artifacts]
  );
  const currentOrientation = readOrientation(currentSourceArtifact) ?? sourceOrientation;

  useEffect(() => {
    if (latestVersion !== undefined) setResultVersion(latestVersion);
  }, [latestVersion]);

  useEffect(() => {
    if (resultVersions.length === 0) return;
    setCurrentStep(2);
    setFurthestStep(2);
  }, [resultVersions.length]);

  useEffect(() => {
    if (selectedResult === undefined) return;
    if (initializedSelectionVersionRef.current === selectedResult.value) return;
    initializedSelectionVersionRef.current = selectedResult.value;
    const saved = readStringArray(session?.state.selectedCandidateIds)
      .filter(id => selectedResult.candidates.some(candidate => candidate.id === id));
    const next = saved.length > 0
      ? saved
      : [...selectedResult.candidates]
          .sort((left, right) => totalScore(right) - totalScore(left))
          .slice(0, Math.min(3, selectedResult.candidates.length))
          .map(candidate => candidate.id);
    setSelected(next);
    setActiveClipId(next[0] ?? selectedResult.candidates[0]?.id ?? '');
    session?.updateDraft({ selectedCandidateIds: next });
  }, [selectedResult?.value, session?.state.selectedCandidateIds, session?.updateDraft]);

  useEffect(() => {
    if (session === null) return;
    session.updateDraft({
      sourceUrl: videoUrl,
      sourceType: sourceArtifactId || videoFile ? 'file' : 'url',
      sourceArtifactId: sourceArtifactId || null,
      focus,
      duration,
      clipCount,
      aspectRatio,
      selectedCandidateIds: selected
    }, { persist: draftInitializedRef.current });
    draftInitializedRef.current = true;
  }, [aspectRatio, clipCount, duration, focus, selected, session?.updateDraft, sourceArtifactId, videoFile, videoUrl]);

  useEffect(() => {
    if (currentSourceArtifact === undefined || session === null) {
      setSourcePreviewUrl('');
      return undefined;
    }
    let active = true;
    let objectUrl = '';
    void session.openArtifact(currentSourceArtifact.id)
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSourcePreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setSourcePreviewUrl('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentSourceArtifact?.id, session?.openArtifact]);

  useEffect(() => {
    if (exportedArtifacts.length === 0 || session === null) {
      setExportUrls({});
      return undefined;
    }
    let active = true;
    const objectUrls: string[] = [];
    void Promise.all(exportedArtifacts.map(async artifact => {
      const response = await session.openArtifact(artifact.id);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrls.push(objectUrl);
      return [artifact.id, objectUrl] as const;
    })).then(entries => {
      if (active) setExportUrls(Object.fromEntries(entries));
    }).catch(cause => {
      if (active) setError(formatClipError(cause, l));
    });
    return () => {
      active = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [exportedArtifacts, l, session?.openArtifact]);

  useEffect(() => {
    if (latestRenderStage?.status === 'succeeded' && exportedArtifacts.length > 0) {
      setNotice(l(
        `已生成 ${exportedArtifacts.length} 个独立视频切片`,
        `${exportedArtifacts.length} standalone video clips are ready`
      ));
      setResultTab('export');
    }
  }, [exportedArtifacts.length, l, latestRenderStage?.id, latestRenderStage?.status]);

  const steps = [
    l('添加视频', 'Add video'),
    l('切片设置', 'Clip settings'),
    l('选择与导出', 'Select and export')
  ];

  function openStep(step: AutoClipStep) {
    setCurrentStep(step);
    setFurthestStep(previous => Math.max(previous, step) as AutoClipStep);
  }

  function continueToSettings() {
    if (!hasSource) {
      setError(l('请先上传视频或填写公开视频链接', 'Upload a video or enter a public video link first'));
      return;
    }
    setError('');
    setNotice('');
    openStep(1);
  }

  function chooseVideo(file: File | null) {
    setVideoFile(file);
    if (file) {
      setVideoUrl('');
      setSourceArtifactId('');
    }
    setSourceOrientation('landscape');
    setError('');
    setNotice('');
  }

  function clearCurrentSource() {
    setVideoFile(null);
    setVideoUrl('');
    setSourceArtifactId('');
    setSourceOrientation('landscape');
    setError('');
    setNotice('');
  }

  async function analyze() {
    if (analyzing || session === null) return;
    if (!hasSource) {
      setCurrentStep(0);
      setError(l('请先上传视频或填写公开视频链接', 'Upload a video or enter a public video link first'));
      return;
    }
    setError('');
    setNotice(l('正在准备视频并识别高光片段', 'Preparing the video and finding highlights'));
    setSelected([]);
    try {
      session.updateDraft({
        sourceUrl: videoUrl,
        sourceType: sourceArtifactId || videoFile ? 'file' : 'url',
        sourceArtifactId: sourceArtifactId || null,
        focus,
        duration,
        clipCount,
        aspectRatio,
        selectedCandidateIds: []
      }, { semantic: true });
      await session.flush();
      let stageId: 'probe' | 'subtitle' | 'analyze';
      if (videoFile !== null) {
        await session.uploadSourceVideo(videoFile);
        stageId = 'subtitle';
        setVideoFile(null);
      } else {
        const source = matchingSourceArtifact(
          session.job.artifacts,
          sourceArtifactId,
          videoUrl
        );
        const subtitle = source === undefined
          ? undefined
          : matchingSubtitleArtifact(session.job.artifacts, source);
        stageId = subtitle !== undefined ? 'analyze' : source !== undefined ? 'subtitle' : 'probe';
      }
      const updatedJob = await session.applyAction({
        actor: 'user',
        action: 'run-stage',
        input: {
          stageId,
          ...(stageId === 'analyze' ? {} : { workflow: true })
        }
      });
      setResultTab('candidates');
      const completedInResponse = updatedJob.artifacts.some(artifact => (
        artifact.kind === 'clip_candidates' && artifact.status === 'completed'
      ));
      const nextStep: AutoClipStep = completedInResponse ? 2 : 1;
      setCurrentStep(nextStep);
      setFurthestStep(previous => Math.max(previous, nextStep) as AutoClipStep);
    } catch (cause) {
      setError(formatClipError(cause, l));
    }
  }

  function toggleClip(id: string) {
    setSelected(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
    setNotice('');
  }

  function selectTopClips() {
    const next = [...candidates]
      .sort((left, right) => totalScore(right) - totalScore(left))
      .slice(0, Math.min(3, candidates.length))
      .map(candidate => candidate.id);
    setSelected(next);
    setSort('score');
    setResultTab('candidates');
    setNotice(l('已选择综合评分最高的 3 个片段', 'Selected the top 3 clips by overall score'));
  }

  function selectVersion(version: number) {
    const result = resultVersions.find(item => item.value === version);
    if (result === undefined) return;
    setResultVersion(version);
    setFocus(readFocus(result.state.focus));
    setDuration(readDuration(result.state.duration));
    setClipCount(readClipCount(result.state.clipCount));
    setAspectRatio(readAspectRatio(result.state.aspectRatio));
    setVideoUrl(readString(result.state.sourceUrl));
    setVideoFile(null);
    setSourceArtifactId(result.sourceArtifact?.id ?? '');
    setResultTab('candidates');
    setCurrentStep(2);
    setFurthestStep(2);
    initializedSelectionVersionRef.current = undefined;
  }

  async function exportSelected() {
    if (selected.length === 0) {
      setError(l('请至少选择一个片段', 'Select at least one clip'));
      return;
    }
    if (exporting || session === null || selectedResult === undefined) return;
    setError('');
    setNotice(l(
      `正在生成 ${selected.length} 个独立视频切片`,
      `Rendering ${selected.length} standalone video clips`
    ));
    setResultTab('export');
    try {
      session.updateDraft({ selectedCandidateIds: selected, aspectRatio }, { semantic: true });
      await session.flush();
      await session.applyAction({
        actor: 'user',
        action: 'run-stage',
        input: {
          stageId: 'render',
          inputResultVersion: selectedResult.value
        }
      });
    } catch (cause) {
      setError(formatClipError(cause, l));
    }
  }

  function downloadArtifact(artifact: CreatorArtifact) {
    const url = exportUrls[artifact.id];
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = artifactFileName(artifact) || `OpenCreator-video-clip-${artifact.version}.mp4`;
    link.click();
    setNotice(l('视频切片已开始下载', 'The video clip download has started'));
  }

  const quickActions = selectedResult === undefined
    ? [{
        id: 'analyze-video-clips',
        label: l('开始识别高光', 'Find highlights'),
        kind: 'action' as const,
        onAction: () => void analyze(),
        disabled: !hasSource || analyzing
      }]
    : [
        {
          id: 'select-top-clips',
          label: l('选择评分最高的 3 个', 'Select top 3 clips'),
          kind: 'action' as const,
          onAction: selectTopClips,
          disabled: candidates.length === 0
        },
        {
          id: 'export-video-clips',
          label: l('导出已选切片', 'Export selected clips'),
          kind: 'action' as const,
          onAction: () => void exportSelected(),
          disabled: selected.length === 0 || exporting
        }
      ];

  return (
    <CreatorToolShell
      title={l('视频切片', 'Video Clips')}
      subtitle={l(
        '自动识别长视频中的高光时刻，选择后生成独立短视频',
        'Find the strongest moments in long videos and turn them into standalone clips'
      )}
      context={selectedResult
        ? l(
            `V${selectedResult.value}，${candidates.length} 个候选，已选 ${selected.length} 个`,
            `V${selectedResult.value}, ${candidates.length} candidates, ${selected.length} selected`
          )
        : analyzing
          ? l('正在识别视频高光', 'Finding video highlights')
          : l('等待添加长视频', 'Waiting for a long video')}
      suggestions={[]}
      quickActions={quickActions}
      placeholder={props.promptHint ?? l(
        '询问切片进度，或描述内容重点、时长和画幅要求',
        'Ask about progress or describe the focus, duration, and format you need'
      )}
      stepLabel={exporting
        ? l('导出视频切片', 'Exporting video clips')
        : analyzing
          ? l('识别视频高光', 'Finding video highlights')
          : currentStep === 2
            ? l('选择与导出', 'Select and export')
            : steps[currentStep]!}
      currentIssue={visibleError || undefined}
      onCancelTask={analyzing || exporting
        ? () => void session?.cancelJob().catch(cause => setError(formatClipError(cause, l)))
        : undefined}
      onResumeTask={session?.job.status === 'canceled'
        ? () => void session.resumeJob().catch(cause => setError(formatClipError(cause, l)))
        : undefined}
      onBack={props.onBack}
    >
      <div className="creator-tool-stack">
        <nav className="video-translation-steps creator-tool-steps" aria-label={l('视频切片流程', 'Video clip workflow')}>
          <ol>{steps.map((step, index) => {
            const active = index === currentStep;
            const completed = index < currentStep;
            return (
              <li key={step} data-active={active} data-completed={completed}>
                <button
                  type="button"
                  disabled={index > furthestStep || analyzing || exporting}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => openStep(index as AutoClipStep)}
                >
                  <span>{completed ? <Check size={13} strokeWidth={2.2} aria-hidden="true" /> : index + 1}</span>
                  <strong>{step}</strong>
                </button>
              </li>
            );
          })}</ol>
        </nav>

        {currentStep === 0 ? (
          <>
            {importedSourceArtifact === undefined ? (
              <VideoSourceInput
                file={videoFile}
                sourceType={videoFile ? 'file' : 'url'}
                url={videoUrl}
                hasSource={hasSource}
                metadataService={props.videoMetadataService}
                onFileChange={chooseVideo}
                onUrlChange={url => {
                  setVideoUrl(url);
                  setVideoFile(null);
                  setSourceArtifactId('');
                  setSourceOrientation('landscape');
                  setError('');
                  setNotice('');
                }}
                onClear={clearCurrentSource}
                onDimensions={(width, height) => setSourceOrientation(height > width ? 'portrait' : 'landscape')}
              />
            ) : (
              <section className="creator-tool-panel" aria-labelledby="video-clips-imported-source-title">
                <div className="creator-tool-panel-heading">
                  <div>
                    <h2 id="video-clips-imported-source-title">{l('项目视频', 'Project video')}</h2>
                    <p>{l('已从项目产出导入，无需重新下载', 'Imported from a project output without downloading it again')}</p>
                  </div>
                </div>
                <div className="video-result-file-row">
                  <span><FileVideo size={18} strokeWidth={1.7} /></span>
                  <div>
                    <strong>{importedSourceName}</strong>
                    <small>{l('已关联到当前视频切片任务', 'Attached to this video clip job')}</small>
                  </div>
                  <button type="button" onClick={clearCurrentSource}>{l('更换', 'Change')}</button>
                </div>
              </section>
            )}
            <div className="creator-tool-actions">
              <button className="creator-tool-primary" type="button" disabled={!hasSource} onClick={continueToSettings}>
                {l('下一步：切片设置', 'Next: Clip settings')}
              </button>
            </div>
          </>
        ) : null}

        {currentStep === 1 ? (
          <div className="creator-task-final-grid">
            <section className="creator-tool-panel" aria-labelledby="video-clips-settings-title">
              <div className="creator-tool-panel-heading">
                <div>
                  <h2 id="video-clips-settings-title">{l('设置切片目标', 'Set clip goals')}</h2>
                  <p>{l('AI 会根据内容重点、目标时长和传播完整度寻找最佳片段', 'AI finds the best moments using your focus, duration, and standalone clarity')}</p>
                </div>
              </div>
              <div className="creator-tool-form-row auto-clip-settings-grid">
                <label className="creator-tool-field">
                  <span>{l('内容重点', 'Content focus')}</span>
                  <select aria-label={l('内容重点', 'Content focus')} value={focus} onChange={event => setFocus(event.target.value as AnalysisFocus)}>
                    <option value="balanced">{l('综合表现', 'Balanced')}</option>
                    <option value="viral">{l('传播潜力优先', 'Shareability first')}</option>
                    <option value="knowledge">{l('知识完整度优先', 'Knowledge completeness')}</option>
                  </select>
                </label>
                <label className="creator-tool-field">
                  <span>{l('目标时长', 'Target duration')}</span>
                  <select aria-label={l('目标时长', 'Target duration')} value={duration} onChange={event => setDuration(event.target.value as ClipDuration)}>
                    <option value="15-30">15-30 {l('秒', 'sec')}</option>
                    <option value="30-60">30-60 {l('秒', 'sec')}</option>
                    <option value="60-90">60-90 {l('秒', 'sec')}</option>
                  </select>
                </label>
                <label className="creator-tool-field">
                  <span>{l('候选数量', 'Number of clips')}</span>
                  <input type="number" min="1" max="20" step="1" aria-label={l('候选数量', 'Number of clips')} value={clipCount} onChange={event => setClipCount(clampClipCount(Number(event.target.value)))} />
                </label>
                <label className="creator-tool-field">
                  <span>{l('输出画幅', 'Output format')}</span>
                  <select aria-label={l('输出画幅', 'Output format')} value={aspectRatio} onChange={event => setAspectRatio(event.target.value as ClipAspectRatio)}>
                    <option value="9:16">{l('竖屏', 'Portrait')} 9:16</option>
                    <option value="1:1">{l('方形', 'Square')} 1:1</option>
                    <option value="16:9">{l('横屏', 'Landscape')} 16:9</option>
                    <option value="source">{l('跟随原视频', 'Match source')}</option>
                  </select>
                </label>
              </div>
              <div className="auto-clip-analysis-note">
                <Sparkles size={18} strokeWidth={1.7} />
                <div>
                  <strong>{l(`最多生成 ${clipCount} 个候选片段`, `Up to ${clipCount} candidate clips`)}</strong>
                  <p>{l('每条包含完整字幕、推荐理由、开头吸引力、信息价值、情绪强度和观点完整度评分', 'Each clip includes a transcript, rationale, and scores for hook, information, emotion, and completeness')}</p>
                </div>
              </div>
              <div className="creator-tool-actions">
                <button className="creator-tool-primary" type="button" disabled={analyzing} onClick={() => void analyze()}>
                  {analyzing ? <LoaderCircle className="smart-dubbing-spinner" size={16} /> : <Sparkles size={16} />}
                  {analyzing
                    ? l('正在识别高光', 'Finding highlights')
                    : selectedResult
                      ? l('重新识别并生成新版本', 'Reanalyze as a new version')
                      : l('识别高光片段', 'Find highlight clips')}
                </button>
              </div>
            </section>
            <CreatorTaskSummary
              sourceIcon={FileVideo}
              sourceLabel={l('视频来源', 'Video source')}
              sourceValue={videoFile?.name ?? (importedSourceName || videoUrl)}
              items={[
                { label: l('内容重点', 'Content focus'), value: focusLabel(focus, l) },
                { label: l('目标时长', 'Target duration'), value: `${duration} ${l('秒', 'sec')}` },
                { label: l('候选片段', 'Candidates'), value: String(clipCount) },
                { label: l('输出画幅', 'Output format'), value: aspectRatioLabel(aspectRatio, l) }
              ]}
            />
          </div>
        ) : null}

        {currentStep === 2 && selectedResult ? (
          <section className="video-result-workspace auto-clip-result-workspace" aria-label={l('视频切片项目产出', 'Video clip project outputs')}>
            <div className="video-result-toolbar">
              <div className="video-result-tabs" role="tablist" aria-label={l('视频切片结果类型', 'Video clip result types')}>
                <button type="button" role="tab" aria-selected={resultTab === 'candidates'} onClick={() => setResultTab('candidates')}><ListVideo size={15} strokeWidth={1.8} />{l('候选片段', 'Candidates')}</button>
                <button type="button" role="tab" aria-selected={resultTab === 'details'} onClick={() => setResultTab('details')}><Captions size={15} strokeWidth={1.8} />{l('字幕与评分', 'Transcript and scores')}</button>
                <button type="button" role="tab" aria-selected={resultTab === 'export'} onClick={() => setResultTab('export')}><Download size={15} strokeWidth={1.8} />{l('导出内容', 'Exports')}</button>
                <button type="button" role="tab" aria-selected={resultTab === 'settings'} onClick={() => setResultTab('settings')}><Settings2 size={15} strokeWidth={1.8} />{l('任务设置', 'Task settings')}</button>
              </div>
              <CreatorResultVersionMenu
                version={selectedResult.value}
                versions={resultVersions.map(version => ({ value: version.value, description: version.description }))}
                onVersionChange={selectVersion}
              />
            </div>
            <div className="auto-clip-result-content">
              {resultTab === 'candidates' ? (
                <div className="video-result-pane">
                  <header className="video-result-pane-heading">
                    <div>
                      <h2>{l(`已找到 ${candidates.length} 个候选片段`, `Found ${candidates.length} candidate clips`)}</h2>
                      <p>{l(`V${selectedResult.value}，已选 ${selected.length} 个`, `V${selectedResult.value}, ${selected.length} selected`)}</p>
                    </div>
                    <div className="auto-clip-result-actions">
                      <div className="auto-clip-layout-switch" role="group" aria-label={l('候选片段布局', 'Candidate clip layout')}>
                        <button type="button" aria-pressed={clipLayout === 'grid'} aria-label={l('网格视图', 'Grid view')} title={l('网格视图', 'Grid view')} onClick={() => setClipLayout('grid')}><LayoutGrid size={16} strokeWidth={1.8} /></button>
                        <button type="button" aria-pressed={clipLayout === 'list'} aria-label={l('列表视图', 'List view')} title={l('列表视图', 'List view')} onClick={() => setClipLayout('list')}><List size={16} strokeWidth={1.8} /></button>
                      </div>
                      <label>{l('排序', 'Sort')}
                        <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
                          <option value="score">{l('综合评分', 'Overall score')}</option>
                          <option value="time">{l('原片顺序', 'Source order')}</option>
                        </select>
                      </label>
                      <button type="button" disabled={selected.length === 0 || exporting} onClick={() => void exportSelected()}>
                        {exporting ? <LoaderCircle className="smart-dubbing-spinner" size={15} /> : <Download size={15} />}
                        {l('导出已选', 'Export selected')} ({selected.length})
                      </button>
                    </div>
                  </header>
                  {clipLayout === 'grid' ? (
                    <section className="auto-clip-candidate-grid" data-orientation={currentOrientation} aria-label={l('候选片段网格', 'Candidate clip grid')}>
                      {orderedClips.map(clip => (
                        <article key={clip.id} data-selected={selected.includes(clip.id)}>
                          <div className="auto-clip-card-media">
                            {sourcePreviewUrl ? <video src={mediaFragment(sourcePreviewUrl, clip)} muted playsInline preload="metadata" aria-hidden="true" /> : <span className="auto-clip-media-placeholder"><FileVideo size={24} /></span>}
                            <span className="auto-clip-card-duration">{formatDuration(clip.end - clip.start)}</span>
                            <label><input type="checkbox" checked={selected.includes(clip.id)} onChange={() => toggleClip(clip.id)} aria-label={`${l('选择片段', 'Select clip')} ${clip.title}`} /></label>
                            <button type="button" onClick={() => { setActiveClipId(clip.id); setResultTab('details'); }} aria-label={`${l('播放片段', 'Play clip')} ${clip.title}`}><Play size={18} fill="currentColor" /></button>
                          </div>
                          <div className="auto-clip-card-copy"><strong>{clip.title}</strong><span>{formatTimeRange(clip)}</span></div>
                          <footer><span>{l('综合评分', 'Score')} <b>{totalScore(clip)}</b></span><div><button type="button" onClick={() => { setActiveClipId(clip.id); setResultTab('details'); }} aria-label={`${l('查看片段', 'View clip')} ${clip.title}`} title={l('查看详情', 'View details')}><Captions size={15} /></button></div></footer>
                        </article>
                      ))}
                    </section>
                  ) : (
                    <section className="auto-clip-candidate-detailed-list" data-orientation={currentOrientation} aria-label={l('候选片段列表', 'Candidate clip list')}>
                      {orderedClips.map(clip => (
                        <article key={clip.id} data-selected={selected.includes(clip.id)}>
                          <label className="auto-clip-list-select"><input type="checkbox" checked={selected.includes(clip.id)} onChange={() => toggleClip(clip.id)} aria-label={`${l('选择片段', 'Select clip')} ${clip.title}`} /></label>
                          <button className="auto-clip-list-preview" type="button" onClick={() => { setActiveClipId(clip.id); setResultTab('details'); }} aria-label={`${l('播放片段', 'Play clip')} ${clip.title}`}>
                            {sourcePreviewUrl ? <video src={mediaFragment(sourcePreviewUrl, clip)} muted playsInline preload="metadata" aria-hidden="true" /> : <span className="auto-clip-media-placeholder"><FileVideo size={24} /></span>}
                            <span>{formatDuration(clip.end - clip.start)}</span><Play size={18} fill="currentColor" />
                          </button>
                          <div className="auto-clip-list-content">
                            <header><div><strong>{clip.title}</strong><span>{formatTimeRange(clip)}</span></div><b>{totalScore(clip)}</b></header>
                            <p>{clip.transcript}</p>
                            <dl>{Object.entries(clip.scores).map(([key, score]) => <div key={key}><dt>{scoreLabel(key as ClipScoreKey, l)}</dt><dd>{score}</dd></div>)}</dl>
                          </div>
                          <div className="auto-clip-list-actions"><button type="button" onClick={() => { setActiveClipId(clip.id); setResultTab('details'); }} aria-label={`${l('查看片段', 'View clip')} ${clip.title}`}><Captions size={15} />{l('查看详情', 'View details')}</button></div>
                        </article>
                      ))}
                    </section>
                  )}
                </div>
              ) : null}

              {resultTab === 'details' && currentClip ? (
                <div className="video-result-pane">
                  <header className="video-result-pane-heading"><div><h2>{l('字幕与四维评分', 'Transcript and four scores')}</h2><p>{l('检查片段是否能够脱离原视频独立传播', 'Check whether this clip can stand on its own')}</p></div><button type="button" onClick={() => setResultTab('candidates')}>{l('返回候选片段', 'Back to candidates')}</button></header>
                  <aside className="auto-clip-detail auto-clip-detail-result" data-orientation={currentOrientation} aria-label={`${l('片段详情', 'Clip details')} ${currentClip.title}`}>
                    <div className="auto-clip-player">
                      {sourcePreviewUrl ? <video controls playsInline preload="metadata" src={mediaFragment(sourcePreviewUrl, currentClip)} aria-label={l('片段预览', 'Clip preview')} /> : <span className="auto-clip-media-placeholder"><FileVideo size={28} /></span>}
                    </div>
                    <header><div><small>{formatTimeRange(currentClip)}</small><h2>{currentClip.title}</h2><p>{currentClip.reason}</p></div><strong>{totalScore(currentClip)}</strong></header>
                    <dl className="auto-clip-scores">
                      <div><dt>{l('开头吸引力', 'Hook')}</dt><dd>{currentClip.scores.hook}</dd></div>
                      <div><dt>{l('信息价值', 'Information')}</dt><dd>{currentClip.scores.information}</dd></div>
                      <div><dt>{l('情绪强度', 'Emotion')}</dt><dd>{currentClip.scores.emotion}</dd></div>
                      <div><dt>{l('观点完整度', 'Completeness')}</dt><dd>{currentClip.scores.completeness}</dd></div>
                    </dl>
                    <section className="auto-clip-subtitle"><h3>{l('片段字幕', 'Clip transcript')}</h3><p>{currentClip.transcript}</p></section>
                    <button type="button" onClick={() => toggleClip(currentClip.id)}>{selected.includes(currentClip.id) ? <><Check size={15} />{l('已选择', 'Selected')}</> : l('选择此片段', 'Select this clip')}</button>
                  </aside>
                </div>
              ) : null}

              {resultTab === 'export' ? (
                <div className="video-result-pane">
                  <header className="video-result-pane-heading">
                    <div><h2>{l('独立视频切片', 'Standalone video clips')}</h2><p>{l('每个已选片段会生成单独的 MP4 文件', 'Every selected moment is rendered as its own MP4 file')}</p></div>
                    <button type="button" disabled={selected.length === 0 || exporting} onClick={() => void exportSelected()}>{exporting ? <LoaderCircle className="smart-dubbing-spinner" size={15} /> : <Scissors size={15} />}{exportedArtifacts.length ? l('重新导出', 'Export again') : l('生成切片', 'Render clips')}</button>
                  </header>
                  {exporting ? (
                    <div className="video-result-empty" role="status"><LoaderCircle className="smart-dubbing-spinner" size={26} /><strong>{l('正在生成视频切片', 'Rendering video clips')}</strong><span>{readProgressText(latestRenderStage, l)}</span></div>
                  ) : exportedArtifacts.length > 0 ? (
                    <div className="auto-clip-export-grid">
                      {exportedArtifacts.map(artifact => (
                        <article className="auto-clip-export-card" key={artifact.id}>
                          {exportUrls[artifact.id] ? <video controls playsInline preload="metadata" src={exportUrls[artifact.id]} /> : <div className="auto-clip-export-loading"><LoaderCircle className="smart-dubbing-spinner" size={22} /></div>}
                          <footer>
                            <div><strong>{artifactFileName(artifact)}</strong><span>{aspectRatioLabel(readAspectRatio(artifact.metadata.aspectRatio), l)} · {formatDuration(readNumber(artifact.metadata.duration))}</span></div>
                            <button type="button" disabled={!exportUrls[artifact.id]} onClick={() => downloadArtifact(artifact)} aria-label={`${l('下载视频切片', 'Download video clip')} ${artifactFileName(artifact)}`}><Download size={16} /></button>
                          </footer>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="video-result-empty"><Scissors size={26} strokeWidth={1.5} /><strong>{l('还没有生成视频切片', 'No video clips rendered yet')}</strong><span>{l(`已选择 ${selected.length} 个候选片段`, `${selected.length} candidates selected`)}</span><button type="button" onClick={() => setResultTab('candidates')}>{l('返回选择片段', 'Choose clips')}</button></div>
                  )}
                </div>
              ) : null}

              {resultTab === 'settings' ? (
                <div className="video-result-pane">
                  <header className="video-result-pane-heading"><div><h2>{l('当前版本设置', 'Current version settings')}</h2><p>{l('调整内容重点、时长或数量后重新识别，会保留为新版本', 'Reanalyzing after changing focus, duration, or count creates a new version')}</p></div><div className="video-result-pane-actions"><button type="button" onClick={() => openStep(0)}><FileVideo size={15} />{l('更换视频', 'Change video')}</button><button type="button" onClick={() => openStep(1)}><SlidersHorizontal size={15} />{l('调整切片设置', 'Adjust clip settings')}</button></div></header>
                  <dl className="video-result-settings">
                    <div><dt>{l('视频来源', 'Video source')}</dt><dd>{artifactFileName(selectedResult.sourceArtifact) || readString(selectedResult.state.sourceUrl)}</dd></div>
                    <div><dt>{l('候选数量', 'Candidates')}</dt><dd>{selectedResult.candidates.length}</dd></div>
                    <div><dt>{l('输出画幅', 'Output format')}</dt><dd>{aspectRatioLabel(readAspectRatio(selectedResult.state.aspectRatio), l)}</dd></div>
                    <div><dt>{l('内容重点', 'Content focus')}</dt><dd>{focusLabel(readFocus(selectedResult.state.focus), l)}</dd></div>
                    <div><dt>{l('目标时长', 'Target duration')}</dt><dd>{readDuration(selectedResult.state.duration)} {l('秒', 'sec')}</dd></div>
                  </dl>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {analyzing && currentStep !== 2 ? (
          <p className="creator-tool-notice" role="status"><LoaderCircle className="smart-dubbing-spinner" size={14} />{readProgressText(latestAnalysisStage, l)}</p>
        ) : notice ? <p className="creator-tool-notice" role="status">{notice}</p> : null}
        {visibleError ? <p className="creator-tool-error" role="alert">{visibleError}</p> : null}
      </div>
    </CreatorToolShell>
  );
}

function createAutoClipResultVersions(
  artifacts: CreatorArtifact[],
  resultSnapshots: CreatorJson | undefined
): AutoClipResultVersion[] {
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  const versions = readCreatorResultSnapshots(resultSnapshots).flatMap(snapshot => {
    const artifact = (snapshot.artifactRefs.clip_candidates ?? [])
      .map(id => byId.get(id))
      .find((candidate): candidate is CreatorArtifact => candidate !== undefined);
    if (artifact === undefined) return [];
    const candidates = readCandidates(artifact.metadata.candidates);
    if (candidates.length === 0) return [];
    const sourceArtifact = (snapshot.artifactRefs.source_video ?? [])
      .map(id => byId.get(id))
      .find((candidate): candidate is CreatorArtifact => candidate !== undefined);
    return [{
      value: snapshot.version,
      description: snapshot.description,
      state: snapshot.state,
      artifact,
      ...(sourceArtifact === undefined ? {} : { sourceArtifact }),
      candidates
    }];
  });
  if (versions.length > 0) return versions.sort((left, right) => left.value - right.value);
  return artifacts
    .filter(artifact => artifact.kind === 'clip_candidates')
    .flatMap(artifact => {
      const candidates = readCandidates(artifact.metadata.candidates);
      if (candidates.length === 0) return [];
      return [{
        value: readPositiveInteger(artifact.metadata.resultVersion) ?? artifact.version,
        description: '识别视频高光片段',
        state: {},
        artifact,
        sourceArtifact: artifacts.find(candidate => (
          candidate.kind === 'source_video'
          && artifact.sourceArtifactIds.includes(candidate.id)
        )),
        candidates
      }];
    })
    .sort((left, right) => left.value - right.value);
}

function readCandidates(value: CreatorJson | undefined): ClipCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const scores = isRecord(item.scores) ? item.scores : undefined;
    const id = readString(item.id);
    const title = readString(item.title);
    const transcript = readString(item.transcript);
    const reason = readString(item.reason);
    const start = readNumber(item.start);
    const end = readNumber(item.end);
    if (!id || !title || !transcript || !reason || end <= start || scores === undefined) return [];
    return [{
      id,
      title,
      transcript,
      reason,
      start,
      end,
      scores: {
        hook: scoreValue(scores.hook),
        information: scoreValue(scores.information),
        emotion: scoreValue(scores.emotion),
        completeness: scoreValue(scores.completeness)
      }
    }];
  });
}

function totalScore(clip: ClipCandidate): number {
  const values = Object.values(clip.scores);
  return Math.round(values.reduce((sum, score) => sum + score, 0) / values.length);
}

function scoreValue(value: CreatorJson | undefined): number {
  return Math.max(0, Math.min(100, Math.round(readNumber(value))));
}

function formatTimeRange(clip: ClipCandidate): string {
  return `${formatTimestamp(clip.start)} - ${formatTimestamp(clip.end)}`;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remaining = total % 60;
  return hours > 0
    ? [hours, minutes, remaining].map(value => String(value).padStart(2, '0')).join(':')
    : [minutes, remaining].map(value => String(value).padStart(2, '0')).join(':');
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  return value >= 60
    ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
    : `${value}s`;
}

function mediaFragment(url: string, clip: ClipCandidate): string {
  return `${url}#t=${clip.start},${clip.end}`;
}

function focusLabel(value: AnalysisFocus, l: ReturnType<typeof useLocalizedCopy>): string {
  if (value === 'viral') return l('传播潜力优先', 'Shareability first');
  if (value === 'knowledge') return l('知识完整度优先', 'Knowledge completeness');
  return l('综合表现', 'Balanced');
}

function aspectRatioLabel(value: ClipAspectRatio, l: ReturnType<typeof useLocalizedCopy>): string {
  if (value === '16:9') return l('横屏 16:9', 'Landscape 16:9');
  if (value === '9:16') return l('竖屏 9:16', 'Portrait 9:16');
  if (value === '1:1') return l('方形 1:1', 'Square 1:1');
  return l('跟随原视频', 'Match source');
}

function scoreLabel(value: ClipScoreKey, l: ReturnType<typeof useLocalizedCopy>): string {
  if (value === 'hook') return l('开头', 'Hook');
  if (value === 'information') return l('信息', 'Information');
  if (value === 'emotion') return l('情绪', 'Emotion');
  return l('完整度', 'Completeness');
}

function readProgressText(
  stage: CreatorStageRun | undefined,
  l: ReturnType<typeof useLocalizedCopy>
): string {
  if (stage?.stageId === 'probe') return l('正在读取视频信息', 'Reading video information');
  if (stage?.stageId === 'download') return l('正在下载源视频', 'Downloading the source video');
  if (stage?.stageId === 'subtitle') return l('正在生成视频字幕', 'Generating the transcript');
  if (stage?.stageId === 'analyze') return l('正在识别最适合独立传播的高光片段', 'Finding the strongest standalone moments');
  if (stage?.stageId === 'render') {
    const completed = readNumber(stage.progress.completed);
    const total = readNumber(stage.progress.total);
    return total > 0
      ? l(`正在生成切片 ${completed}/${total}`, `Rendering clips ${completed}/${total}`)
      : l('正在生成视频切片', 'Rendering video clips');
  }
  return l('正在准备任务', 'Preparing the task');
}

function readFocus(value: CreatorJson | undefined): AnalysisFocus {
  return value === 'viral' || value === 'knowledge' ? value : 'balanced';
}

function readDuration(value: CreatorJson | undefined): ClipDuration {
  return value === '15-30' || value === '60-90' ? value : '30-60';
}

function readAspectRatio(value: CreatorJson | undefined): ClipAspectRatio {
  return value === 'source' || value === '16:9' || value === '1:1' ? value : '9:16';
}

function readClipCount(value: CreatorJson | undefined): number {
  return typeof value === 'number' ? clampClipCount(value) : 10;
}

function clampClipCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function readString(value: CreatorJson | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: CreatorJson | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumber(value: CreatorJson | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readPositiveInteger(value: CreatorJson | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isRecord(value: CreatorJson | undefined): value is Record<string, CreatorJson> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function findArtifact(
  artifacts: CreatorArtifact[],
  artifactId: string,
  kind: string
): CreatorArtifact | undefined {
  return artifacts.find(artifact => (
    artifact.id === artifactId
    && artifact.kind === kind
    && artifact.status === 'completed'
  ));
}

function latestCompletedArtifact(
  artifacts: CreatorArtifact[],
  kind: string
): CreatorArtifact | undefined {
  return [...artifacts].reverse().find(artifact => (
    artifact.kind === kind && artifact.status === 'completed'
  ));
}

function matchingSourceArtifact(
  artifacts: CreatorArtifact[],
  artifactId: string,
  sourceUrl: string
): CreatorArtifact | undefined {
  const selected = findArtifact(artifacts, artifactId, 'source_video');
  if (selected !== undefined) return selected;
  const normalizedUrl = sourceUrl.trim();
  return [...artifacts].reverse().find(artifact => (
    artifact.kind === 'source_video'
    && artifact.status === 'completed'
    && normalizedUrl.length > 0
    && [artifact.metadata.sourceUrl, artifact.metadata.requestedUrl, artifact.metadata.webpageUrl]
      .some(value => typeof value === 'string' && value.trim() === normalizedUrl)
  ));
}

function matchingSubtitleArtifact(
  artifacts: CreatorArtifact[],
  source: CreatorArtifact
): CreatorArtifact | undefined {
  return [...artifacts].reverse().find(artifact => (
    artifact.kind === 'target_subtitle'
    && artifact.status === 'completed'
    && artifact.sourceArtifactIds.includes(source.id)
  ));
}

function latestStage(stages: CreatorStageRun[], stageIds: Set<string>): CreatorStageRun | undefined {
  return [...stages].reverse().find(stage => stageIds.has(stage.stageId));
}

function latestFailedStage(stages: CreatorStageRun[]): CreatorStageRun | undefined {
  return [...stages].reverse().find(stage => stage.status === 'failed');
}

function latestExportsForCandidateArtifact(
  artifacts: CreatorArtifact[],
  candidateArtifactId: string
): CreatorArtifact[] {
  const latestByCandidate = new Map<string, CreatorArtifact>();
  for (const artifact of artifacts) {
    if (
      artifact.kind !== 'auto_clip_video'
      || artifact.status !== 'completed'
      || artifact.metadata.candidateArtifactId !== candidateArtifactId
    ) continue;
    const candidateId = readString(artifact.metadata.candidateId) || artifact.id;
    latestByCandidate.set(candidateId, artifact);
  }
  return [...latestByCandidate.values()].sort((left, right) => (
    readNumber(left.metadata.start) - readNumber(right.metadata.start)
  ));
}

function artifactFileName(artifact: CreatorArtifact | undefined): string {
  if (artifact === undefined) return '';
  const value = artifact.metadata.fileName;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readOrientation(artifact: CreatorArtifact | undefined): VideoOrientation | undefined {
  const width = readNumber(artifact?.metadata.width);
  const height = readNumber(artifact?.metadata.height);
  if (width <= 0 || height <= 0) return undefined;
  return height > width ? 'portrait' : 'landscape';
}

function formatClipError(
  error: unknown,
  l: (zh: string, en: string) => string
): string {
  if (error === null || error === undefined) return '';
  const candidate = error as { code?: unknown; errorCode?: unknown; message?: unknown; errorMessage?: unknown };
  const code = typeof candidate.code === 'string'
    ? candidate.code
    : typeof candidate.errorCode === 'string'
      ? candidate.errorCode
      : '';
  if (code === 'creator_llm_config_missing') return l('请先在设置中配置文本模型', 'Configure the text model in Settings first');
  if (code === 'creator_transcription_config_missing') return l('请先在设置中配置视频转录服务', 'Configure video transcription in Settings first');
  if (code === 'unsupported_source') return l('目前仅支持公开视频链接或本地视频文件', 'Use a supported public video URL or a local video file');
  if (code === 'creator_clip_selection_missing') return l('请至少选择一个候选片段', 'Select at least one candidate clip');
  if (code === 'creator_stage_canceled') return l('视频切片任务已取消', 'The video clip task was canceled');
  const message = typeof candidate.message === 'string'
    ? candidate.message
    : typeof candidate.errorMessage === 'string'
      ? candidate.errorMessage
      : error instanceof Error
        ? error.message
        : '';
  return message || l('视频切片失败，请稍后重试', 'Video clipping failed. Try again later.');
}

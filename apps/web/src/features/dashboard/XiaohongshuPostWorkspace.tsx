import type { CreatorArtifact, CreatorJson } from '@opencreator/protocol';
import {
  Copy,
  Download,
  LoaderCircle,
  NotebookPen,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import CreatorToolShell from './CreatorToolShell.js';
import { useOptionalCreatorSession } from './creator-session-store.js';

type PostStyle = 'experience' | 'tutorial' | 'recommendation' | 'review';
type PostLength = 'short' | 'medium' | 'long';

const styles: Array<{ value: PostStyle; zh: string; en: string }> = [
  { value: 'experience', zh: '经验分享', en: 'Experience' },
  { value: 'tutorial', zh: '教程干货', en: 'Tutorial' },
  { value: 'recommendation', zh: '产品种草', en: 'Recommendation' },
  { value: 'review', zh: '真实测评', en: 'Review' }
];

const lengths: Array<{ value: PostLength; zh: string; en: string }> = [
  { value: 'short', zh: '精简', en: 'Short' },
  { value: 'medium', zh: '标准', en: 'Standard' },
  { value: 'long', zh: '详细', en: 'Detailed' }
];

export default function XiaohongshuPostWorkspace(props: {
  onBack(): void;
  promptHint?: string;
}) {
  const l = useLocalizedCopy();
  const session = useOptionalCreatorSession();
  const [topic, setTopic] = useState(() => readString(session?.state.topic));
  const [audience, setAudience] = useState(() => readString(session?.state.audience));
  const [style, setStyle] = useState<PostStyle>(() => readStyle(session?.state.style));
  const [length, setLength] = useState<PostLength>(() => readLength(session?.state.length));
  const [extraRequirements, setExtraRequirements] = useState(
    () => readString(session?.state.extraRequirements)
  );
  const [resultText, setResultText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [taskControlPending, setTaskControlPending] = useState<'canceling' | 'resuming'>();
  const result = useMemo(
    () => readLatestResult(session?.job.artifacts ?? []),
    [session?.job.artifacts]
  );
  const latestStage = session?.job.stages.filter(stage => stage.stageId === 'generate').at(-1);
  const generating = latestStage?.status === 'queued' || latestStage?.status === 'running';
  const runtimeError = latestStage?.status === 'failed'
    ? generationError(latestStage.errorCode, latestStage.errorMessage, l)
    : session?.error === null || session?.error === undefined
      ? ''
      : generationError(session.error.code, session.error.message, l);
  const visibleError = error || runtimeError;

  useEffect(() => {
    setTopic(readString(session?.state.topic));
    setAudience(readString(session?.state.audience));
    setStyle(readStyle(session?.state.style));
    setLength(readLength(session?.state.length));
    setExtraRequirements(readString(session?.state.extraRequirements));
  }, [
    session?.state.topic,
    session?.state.audience,
    session?.state.style,
    session?.state.length,
    session?.state.extraRequirements
  ]);

  useEffect(() => {
    setResultText('');
    setError('');
    if (session === null || result === undefined) {
      return;
    }
    let active = true;
    void session.openArtifact(result.artifact.id)
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (active) setResultText(text);
      })
      .catch(cause => {
        if (active) setError(l(
          '帖子内容加载失败，可以稍后重试或重新生成',
          `The post failed to load: ${cause instanceof Error ? cause.message : String(cause)}`
        ));
      });
    return () => { active = false; };
  }, [l, result?.artifact.id, session?.openArtifact]);

  function updateTopic(value: string) {
    setTopic(value);
    session?.updateDraft({ topic: value });
    setError('');
  }

  function updateAudience(value: string) {
    setAudience(value);
    session?.updateDraft({ audience: value });
    setError('');
  }

  function updateStyle(value: PostStyle) {
    setStyle(value);
    session?.updateDraft({ style: value });
    setError('');
  }

  function updateLength(value: PostLength) {
    setLength(value);
    session?.updateDraft({ length: value });
    setError('');
  }

  function updateExtraRequirements(value: string) {
    setExtraRequirements(value);
    session?.updateDraft({ extraRequirements: value });
    setError('');
  }

  async function generate() {
    if (generating) return;
    if (session === null) {
      setError(l(
        '小红书帖子生成服务暂不可用，请检查 Runtime 连接',
        'Post generation is unavailable. Check the Runtime connection.'
      ));
      return;
    }
    if (!topic.trim()) {
      setError(l('请先填写创作主题或素材', 'Enter a topic or source material'));
      return;
    }
    setError('');
    setNotice('');
    session.updateDraft({
      topic: topic.trim(),
      audience: audience.trim(),
      style,
      length,
      extraRequirements: extraRequirements.trim()
    }, { semantic: true });
    try {
      await session.flush();
      await session.applyAction({
        actor: 'user',
        action: 'run-stage',
        input: { stageId: 'generate' }
      });
      setNotice(l(
        '生成任务已提交，完成后会自动显示帖子',
        'Generation started. The post will appear automatically.'
      ));
    } catch (caught) {
      const value = caught as { code?: string; message?: string };
      setError(generationError(value.code ?? null, value.message ?? null, l));
    }
  }

  async function copyResult() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setNotice(l('帖子已复制到剪贴板', 'Post copied to the clipboard'));
    } catch {
      setError(l('复制失败，请手动选择帖子内容', 'Copy failed. Select the post manually.'));
    }
  }

  function downloadResult() {
    if (!result || !resultText) return;
    const url = URL.createObjectURL(new Blob([resultText], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(l('帖子文件已开始下载', 'The post download has started'));
  }

  async function cancelTask() {
    if (session === null || taskControlPending !== undefined) return;
    setTaskControlPending('canceling');
    try {
      await session.cancelJob();
    } catch (caught) {
      const value = caught as { code?: string; message?: string };
      setError(generationError(value.code ?? null, value.message ?? null, l));
    } finally {
      setTaskControlPending(undefined);
    }
  }

  async function resumeTask() {
    if (session === null || taskControlPending !== undefined) return;
    setTaskControlPending('resuming');
    try {
      await session.resumeJob();
    } catch (caught) {
      const value = caught as { code?: string; message?: string };
      setError(generationError(value.code ?? null, value.message ?? null, l));
    } finally {
      setTaskControlPending(undefined);
    }
  }

  const selectedStyle = styles.find(item => item.value === style) ?? styles[0]!;
  const selectedLength = lengths.find(item => item.value === length) ?? lengths[1]!;
  return (
    <CreatorToolShell
      title={l('小红书帖子生成器', 'Xiaohongshu Post Generator')}
      subtitle={l('从主题和素材生成完整帖子', 'Turn a topic or source material into a complete post')}
      context={result
        ? result.title
        : generating
          ? l('正在生成帖子', 'Generating post')
          : `${l(selectedStyle.zh, selectedStyle.en)} · ${l(selectedLength.zh, selectedLength.en)}`}
      stepLabel={generating ? l('正在生成帖子', 'Generating post') : l('小红书帖子', 'Xiaohongshu post')}
      currentIssue={visibleError || undefined}
      suggestions={result
        ? [l('标题更有吸引力', 'Make the title more engaging'), l('减少营销感', 'Make it less promotional')]
        : [l('写成教程干货', 'Write a tutorial'), l('使用真诚自然的语气', 'Use a sincere, natural tone')]}
      placeholder={props.promptHint ?? l(
        '描述要调整的主题、受众、内容类型或篇幅',
        'Describe changes to the topic, audience, style, or length'
      )}
      onBack={props.onBack}
      onCancelTask={() => void cancelTask()}
      onResumeTask={() => void resumeTask()}
      taskControlPending={taskControlPending}
      pageClassName="xiaohongshu-post-workspace-page"
    >
      <div className="creator-tool-stack xiaohongshu-post-stack">
        <section className="creator-tool-panel" aria-labelledby="xiaohongshu-post-settings-title">
          <div className="creator-tool-panel-heading">
            <div>
              <h2 id="xiaohongshu-post-settings-title">{l('创作设置', 'Post settings')}</h2>
              <p>{l('提供事实、观点或产品素材，生成内容会以这些信息为准', 'Provide facts, ideas, or product material for the post')}</p>
            </div>
          </div>
          <div className="xiaohongshu-post-fields">
            <label className="creator-tool-field">
              <span>{l('主题或素材', 'Topic or source material')}</span>
              <textarea
                rows={8}
                maxLength={5000}
                value={topic}
                onChange={event => updateTopic(event.target.value)}
                placeholder={l('输入要表达的主题、事实、观点或产品信息', 'Enter the topic, facts, ideas, or product details')}
                aria-label={l('小红书帖子主题或素材', 'Post topic or source material')}
              />
            </label>
            <label className="creator-tool-field">
              <span>{l('目标读者', 'Audience')} <small>{l('选填', 'Optional')}</small></span>
              <input
                maxLength={500}
                value={audience}
                onChange={event => updateAudience(event.target.value)}
                placeholder={l('例如：准备参与开源项目的程序员', 'For example: developers new to open source')}
              />
            </label>
            <div className="xiaohongshu-post-control-group">
              <span>{l('内容类型', 'Post type')}</span>
              <div className="creator-tool-segmented" role="radiogroup" aria-label={l('内容类型', 'Post type')}>
                {styles.map(item => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={style === item.value}
                    aria-selected={style === item.value}
                    key={item.value}
                    onClick={() => updateStyle(item.value)}
                  >
                    {l(item.zh, item.en)}
                  </button>
                ))}
              </div>
            </div>
            <div className="xiaohongshu-post-control-group">
              <span>{l('内容篇幅', 'Length')}</span>
              <div className="creator-tool-segmented" role="radiogroup" aria-label={l('内容篇幅', 'Length')}>
                {lengths.map(item => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={length === item.value}
                    aria-selected={length === item.value}
                    key={item.value}
                    onClick={() => updateLength(item.value)}
                  >
                    {l(item.zh, item.en)}
                  </button>
                ))}
              </div>
            </div>
            <label className="creator-tool-field">
              <span>{l('补充要求', 'Additional requirements')} <small>{l('选填', 'Optional')}</small></span>
              <textarea
                rows={3}
                maxLength={2000}
                value={extraRequirements}
                onChange={event => updateExtraRequirements(event.target.value)}
                placeholder={l('例如：语气真诚，减少营销感', 'For example: sincere tone, less promotional')}
              />
            </label>
          </div>
          <div className="creator-tool-actions">
            <button type="button" onClick={() => void generate()} disabled={generating}>
              {generating
                ? <LoaderCircle className="xiaohongshu-post-spinner" size={16} strokeWidth={1.8} aria-hidden="true" />
                : result
                  ? <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
                  : <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />}
              {generating
                ? l('正在生成', 'Generating')
                : result
                  ? l('重新生成', 'Regenerate')
                  : l('生成帖子', 'Generate post')}
            </button>
          </div>
        </section>

        <section className="creator-tool-panel xiaohongshu-post-result-panel" aria-labelledby="xiaohongshu-post-result-title">
          <div className="creator-tool-panel-heading">
            <div>
              <h2 id="xiaohongshu-post-result-title">{l('帖子结果', 'Post result')}</h2>
              <p>{result
                ? l('可以复制到发布工具，或下载 Markdown 文件', 'Copy the post or download it as Markdown')
                : l('完成创作设置后生成帖子', 'Complete the settings to generate a post')}</p>
            </div>
            {result ? <small><NotebookPen size={14} strokeWidth={1.8} aria-hidden="true" />{result.fileName}</small> : null}
          </div>
          {resultText ? (
            <>
              <label className="creator-tool-field">
                <span>{l('完整帖子', 'Complete post')}</span>
                <textarea readOnly rows={14} value={resultText} aria-label={l('生成的小红书帖子', 'Generated Xiaohongshu post')} />
              </label>
              <div className="creator-tool-actions xiaohongshu-post-result-actions">
                <button className="creator-tool-secondary" type="button" onClick={() => void copyResult()}>
                  <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
                  {l('复制帖子', 'Copy post')}
                </button>
                <button className="creator-tool-primary" type="button" onClick={downloadResult}>
                  <Download size={15} strokeWidth={1.8} aria-hidden="true" />
                  {l('下载 Markdown', 'Download Markdown')}
                </button>
              </div>
            </>
          ) : (
            <div className="xiaohongshu-post-empty" aria-live="polite">
              {generating
                ? <LoaderCircle className="xiaohongshu-post-spinner" size={22} strokeWidth={1.7} aria-hidden="true" />
                : <NotebookPen size={22} strokeWidth={1.7} aria-hidden="true" />}
              <span>{generating ? l('正在生成帖子', 'Generating post') : l('还没有生成内容', 'No post generated yet')}</span>
            </div>
          )}
        </section>

        {visibleError ? (
          <div className="xiaohongshu-post-error" role="alert">
            <span>{visibleError}</span>
            {latestStage?.errorCode === 'creator_llm_config_missing' || session?.error?.code === 'creator_llm_config_missing'
              ? <a href="#/settings?tab=ai-services&section=text">{l('打开文本模型设置', 'Open text model settings')}</a>
              : null}
          </div>
        ) : null}
        {notice ? <p className="creator-tool-notice" role="status">{notice}</p> : null}
      </div>
    </CreatorToolShell>
  );
}

function readLatestResult(artifacts: CreatorArtifact[]): {
  artifact: CreatorArtifact;
  fileName: string;
  title: string;
} | undefined {
  const artifact = [...artifacts].reverse().find(candidate => (
    candidate.kind === 'xiaohongshu_post'
    && candidate.path !== null
    && candidate.status === 'completed'
  ));
  if (artifact === undefined) return undefined;
  return {
    artifact,
    fileName: readString(artifact.metadata.fileName) || 'OpenCreator-xiaohongshu-post.md',
    title: readString(artifact.metadata.title) || '小红书帖子'
  };
}

function readStyle(value: CreatorJson | undefined): PostStyle {
  return value === 'tutorial' || value === 'recommendation' || value === 'review'
    ? value
    : 'experience';
}

function readLength(value: CreatorJson | undefined): PostLength {
  return value === 'short' || value === 'long' ? value : 'medium';
}

function readString(value: CreatorJson | undefined): string {
  return typeof value === 'string' ? value : '';
}

function generationError(
  code: string | null,
  message: string | null,
  l: (zh: string, en: string) => string
): string {
  if (code === 'creator_llm_config_missing') {
    return l(
      '请先在设置的 AI 服务中配置文本模型',
      'Configure a text model in AI Services first'
    );
  }
  if (code === 'creator_stage_input_missing') {
    return l('请检查创作主题和生成设置', 'Check the topic and generation settings');
  }
  return message || l('帖子生成失败，请稍后重试', 'Post generation failed. Try again later.');
}

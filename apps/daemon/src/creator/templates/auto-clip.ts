import { z } from 'zod';
import type { CreatorTemplateDefinition } from './types.js';
const record = z.record(z.string(), z.unknown()) as never;

export function createLegacyAutoClipTemplate(): CreatorTemplateDefinition {
  return {
    id: 'auto-clip', version: 1, renderer: 'auto-clips',
    inputSchema: z.object({
      sourceType: z.enum(['url', 'file']).default('url'),
      sourceUrl: z.string().default(''),
      sourceArtifactId: z.string().nullable().default(null),
      formatId: z.string().default('bestvideo+bestaudio/best'),
      sourceLanguage: z.string().default('auto'),
      targetLanguage: z.string().default('zh-CN'),
      preferPlatformCaptions: z.boolean().default(true),
      selectedCandidateIds: z.array(z.string()).default([]),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [
      { id: 'probe', executor: 'download', allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [], outputArtifacts: [{ kind: 'download_probe', status: 'completed' }] },
      { id: 'download', executor: 'download', dependsOn: ['probe'], allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [{ kind: 'download_probe', selector: 'latest-completed' }], outputArtifacts: [{ kind: 'source_video', status: 'completed' }] },
      { id: 'subtitle', executor: 'krillinai', dependsOn: ['download'], allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [{ kind: 'source_video', selector: 'latest-completed' }], outputArtifacts: [{ kind: 'target_subtitle', status: 'completed' }] },
      { id: 'analyze', executor: 'clip', dependsOn: ['subtitle'], allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [{ kind: 'source_video', selector: 'latest-completed' }, { kind: 'target_subtitle', selector: 'latest-completed' }], outputArtifacts: [{ kind: 'clip_candidates', status: 'completed' }] },
      { id: 'render', executor: 'clip', dependsOn: ['analyze'], allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [{ kind: 'source_video', selector: 'latest-completed' }, { kind: 'clip_candidates', selector: 'latest-completed' }], outputArtifacts: [{ kind: 'auto_clip_video', status: 'completed' }] }
    ],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'], invalidates: [{ sourceArtifactKind: 'clip_candidates', propagateThroughStageGraph: true }] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'] }
    ],
    outputs: [{ kind: 'auto_clip_video', required: true }],
    agentGuidance: '先分析并展示四维评分候选，用户选择后再渲染。'
  };
}

export function createAutoClipTemplate(): CreatorTemplateDefinition {
  return {
    id: 'auto-clip',
    version: 2,
    renderer: 'auto-clips',
    inputSchema: z.object({
      sourceType: z.enum(['url', 'file']).default('url'),
      sourceUrl: z.string().default(''),
      sourceArtifactId: z.string().nullable().default(null),
      formatId: z.string().default('bestvideo+bestaudio/best'),
      sourceLanguage: z.string().default('auto'),
      targetLanguage: z.string().default('zh-CN'),
      preferPlatformCaptions: z.boolean().default(true),
      focus: z.enum(['balanced', 'viral', 'knowledge']).default('balanced'),
      duration: z.enum(['15-30', '30-60', '60-90']).default('30-60'),
      clipCount: z.number().int().min(1).max(20).default(10),
      aspectRatio: z.enum(['source', '16:9', '9:16', '1:1']).default('9:16'),
      selectedCandidateIds: z.array(z.string()).default([]),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [
      {
        id: 'probe',
        executor: 'download',
        completesJob: false,
        resultVersionPolicy: 'none',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'download_probe', status: 'completed' }]
      },
      {
        id: 'download',
        executor: 'download',
        completesJob: false,
        resultVersionPolicy: 'none',
        dependsOn: ['probe'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [{ kind: 'download_probe', selector: 'latest-completed' }],
        outputArtifacts: [{ kind: 'source_video', status: 'completed' }]
      },
      {
        id: 'subtitle',
        executor: 'krillinai',
        completesJob: false,
        resultVersionPolicy: 'none',
        dependsOn: ['download'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [{ kind: 'source_video', selector: 'latest-completed' }],
        outputArtifacts: [{ kind: 'target_subtitle', status: 'completed' }]
      },
      {
        id: 'analyze',
        executor: 'clip',
        completesJob: false,
        dependsOn: ['subtitle'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'source_video', selector: 'latest-completed' },
          { kind: 'target_subtitle', selector: 'latest-completed' }
        ],
        outputArtifacts: [{ kind: 'clip_candidates', status: 'completed' }]
      },
      {
        id: 'render',
        executor: 'clip',
        resultVersionPolicy: 'none',
        dependsOn: ['analyze'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'source_video', selector: 'latest-completed' },
          { kind: 'clip_candidates', selector: 'latest-completed' }
        ],
        outputArtifacts: [{ kind: 'auto_clip_video', status: 'completed' }]
      }
    ],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['probe', 'download', 'subtitle', 'analyze', 'render'] }
    ],
    outputs: [{ kind: 'auto_clip_video', required: true }],
    agentGuidance: [
      '这是视频切片模板。',
      'URL 来源从 probe 开始并设置 workflow=true，本地或导入视频从 subtitle 开始并设置 workflow=true。',
      'analyze 完成后先展示候选片段与评分，用户选择 selectedCandidateIds 后再运行 render。',
      '不得把多个候选片段拼接成一个文件。'
    ].join(' ')
  };
}

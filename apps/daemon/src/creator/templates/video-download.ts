import { z } from 'zod';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;

export function createLegacyVideoDownloadTemplate(): CreatorTemplateDefinition {
  return {
    id: 'video-download', version: 1, renderer: 'video-download',
    inputSchema: z.object({
      sourceUrl: z.string().default(''),
      formatId: z.string().default('bestvideo+bestaudio/best'),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [
      { id: 'probe', executor: 'download', allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [], outputArtifacts: [{ kind: 'download_probe', status: 'completed' }] },
      { id: 'download', executor: 'download', dependsOn: ['probe'], allowedJobStatuses: ['draft', 'running', 'failed', 'needs_input'], inputArtifacts: [{ kind: 'download_probe', selector: 'latest-completed' }], outputArtifacts: [{ kind: 'source_video', status: 'completed' }] }
    ],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['probe', 'download'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['probe', 'download'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['probe', 'download'] }
    ],
    outputs: [{ kind: 'source_video', required: true }],
    agentGuidance: '先探测格式，再使用探测结果下载；不得猜测 formatId。'
  };
}

export function createVideoDownloadTemplate(): CreatorTemplateDefinition {
  return {
    id: 'video-download',
    version: 2,
    renderer: 'video-download',
    inputSchema: z.object({
      sourceUrl: z.string().default(''),
      mediaType: z.enum(['video', 'audio']).default('video'),
      selectedOptionId: z.string().nullable().default(null),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [
      {
        id: 'probe',
        executor: 'download',
        completesJob: false,
        resultVersionPolicy: 'none',
        invalidateDependentArtifacts: false,
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [],
        outputArtifacts: [{ kind: 'download_probe', status: 'completed' }]
      },
      {
        id: 'download',
        executor: 'download',
        dependsOn: ['probe'],
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [{
          kind: 'download_probe',
          selector: 'latest-completed'
        }],
        outputArtifacts: [
          { kind: 'source_video', status: 'completed' },
          { kind: 'source_audio', status: 'completed' }
        ]
      }
    ],
    actions: [
      {
        id: 'update-settings',
        inputSchema: record,
        allowedStages: ['probe', 'download']
      },
      {
        id: 'run-stage',
        inputSchema: record,
        allowedStages: ['probe', 'download']
      },
      {
        id: 'undo-action',
        inputSchema: record,
        allowedStages: ['probe', 'download']
      }
    ],
    outputs: [
      { kind: 'source_video', required: false },
      { kind: 'source_audio', required: false }
    ],
    agentGuidance: [
      '支持公开的 YouTube、Bilibili、X、TikTok、Instagram、抖音、Facebook、小红书和 Pinterest 视频链接，可下载视频或提取音频。',
      '先设置 sourceUrl 并运行 probe，再读取最新 download_probe.options；只选择其中与用户请求的 video 或 audio 对应的 option.id。',
      '更新 selectedOptionId 和 mediaType 后运行 download；不得自行构造或写入 formatId。若 probe 没有对应选项，再说明该链接无法提供所需媒体。'
    ].join(' ')
  };
}

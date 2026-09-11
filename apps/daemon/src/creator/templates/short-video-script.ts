import { z } from 'zod';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;

export function createShortVideoScriptTemplate(): CreatorTemplateDefinition {
  return {
    id: 'short-video-script',
    version: 1,
    renderer: 'short-video-script',
    inputSchema: z.object({
      topic: z.string().max(5_000).default(''),
      audience: z.string().max(500).default(''),
      platform: z.enum([
        'douyin',
        'xiaohongshu',
        'wechat-channels',
        'bilibili',
        'generic'
      ]).default('douyin'),
      targetDurationSeconds: z.number().int().min(15).max(600).default(60),
      tone: z.enum(['natural', 'professional', 'energetic', 'storytelling']).default('natural'),
      extraRequirements: z.string().max(2_000).default(''),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [{
      id: 'generate',
      executor: 'short-video-script',
      allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
      inputArtifacts: [],
      outputArtifacts: [{ kind: 'short_video_script', status: 'completed' }]
    }],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['generate'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['generate'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['generate'] }
    ],
    outputs: [{ kind: 'short_video_script', required: true }],
    agentGuidance: [
      '帮助用户生成可直接拍摄和修改的短视频脚本。',
      '更新设置必须写入 input.patch，可调整 topic、audience、platform、targetDurationSeconds、tone 和 extraRequirements。',
      'topic 是必填的创作主题或素材；确认要求后运行 generate 阶段。',
      '第一版只生成脚本文本，不生成分镜、图片或视频。',
      '不得伪造用户未提供的事实、经历、数据、产品功效或引用。'
    ].join(' ')
  };
}

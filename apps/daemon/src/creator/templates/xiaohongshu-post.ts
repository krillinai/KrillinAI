import { z } from 'zod';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;

export function createXiaohongshuPostTemplate(): CreatorTemplateDefinition {
  return {
    id: 'xiaohongshu-post',
    version: 1,
    renderer: 'xiaohongshu-post',
    inputSchema: z.object({
      topic: z.string().max(5_000).default(''),
      audience: z.string().max(500).default(''),
      style: z.enum(['experience', 'tutorial', 'recommendation', 'review']).default('experience'),
      length: z.enum(['short', 'medium', 'long']).default('medium'),
      extraRequirements: z.string().max(2_000).default(''),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [{
      id: 'generate',
      executor: 'xiaohongshu-post',
      allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
      inputArtifacts: [],
      outputArtifacts: [{ kind: 'xiaohongshu_post', status: 'completed' }]
    }],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['generate'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['generate'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['generate'] }
    ],
    outputs: [{ kind: 'xiaohongshu_post', required: true }],
    agentGuidance: [
      '帮助用户生成可直接修改和发布的小红书帖子。',
      '更新设置必须写入 input.patch，可调整 topic、audience、style、length 和 extraRequirements。',
      'topic 是必填的创作主题或素材；确认要求后运行 generate 阶段。',
      '不得伪造用户未提供的亲身经历、产品功效、价格或数据。'
    ].join(' ')
  };
}

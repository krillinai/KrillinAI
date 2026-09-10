import {
  wechatArticleImageStyleIds,
  wechatArticleLayoutStyleIds,
  wechatArticleSourceLimit
} from '@opencreator/protocol';
import {
  getWritingTemplate,
  normalizeWritingTemplateId
} from '@opencreator/writing-templates';
import { z } from 'zod';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;
const sourceLink = z.object({
  id: z.string().min(1).max(128),
  url: z.string().url().max(2_048),
  kind: z.enum(['video', 'webpage']),
  label: z.string().max(256)
}).strict();
const topic = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  angle: z.string().max(500),
  summary: z.string().max(1_000)
}).strict();

export function createWechatArticleTemplate(): CreatorTemplateDefinition {
  return {
    id: 'wechat-article',
    version: 1,
    renderer: 'wechat-article',
    inputSchema: z.object({
      sourceLinks: z.array(sourceLink).max(wechatArticleSourceLimit).default([]),
      sourceDocumentArtifactIds: z.array(z.string()).max(wechatArticleSourceLimit).default([]),
      writingPrompt: z.string().max(6_000).default(''),
      topicCount: z.number().int().min(3).max(10).default(5),
      topics: z.array(topic).max(10).default([]),
      selectedTopicId: z.string().max(128).default(''),
      outline: z.string().max(30_000).default(''),
      articleTitle: z.string().max(200).default(''),
      articleMarkdown: z.string().max(120_000).default(''),
      autoGenerateImages: z.boolean().default(true),
      articleImageCount: z.number().int().min(1).max(10).default(5),
      articleImageStyleId: z.enum(wechatArticleImageStyleIds).default('editorial'),
      articleImagePrompt: z.string().max(2_000).default(''),
      manualArticleImageArtifactIds: z.array(z.string()).max(50).default([]),
      hiddenArticleImageArtifactIds: z.array(z.string()).max(100).default([]),
      articleImagePlacementCustomized: z.boolean().default(false),
      presetId: z.string().max(96).transform(normalizeWritingTemplateId).refine(
        id => id === '' || getWritingTemplate(id) !== undefined,
        'Unknown writing template'
      ).default(''),
      layoutStyleId: z.enum(wechatArticleLayoutStyleIds).default('minimal'),
      templatePrompt: z.string().max(8_000).default(''),
      workspacePhase: z.enum(['compose', 'result']).default('compose'),
      currentStep: z.union([
        z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)
      ]).default(0),
      furthestStep: z.union([
        z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)
      ]).default(0),
      currentStage: z.string().nullable().default(null)
    }).passthrough().superRefine((state, context) => {
      if (state.sourceLinks.length + state.sourceDocumentArtifactIds.length <= wechatArticleSourceLimit) return;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A WeChat article can use at most ${wechatArticleSourceLimit} inspiration sources`,
        path: ['sourceLinks']
      });
    }) as never,
    stages: [
      {
        id: 'sources',
        executor: 'wechat-article',
        completesJob: false,
        resultVersionPolicy: 'none',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [{
          kind: 'source_document',
          selector: 'latest-completed',
          optional: true
        }],
        outputArtifacts: [{ kind: 'article_sources', status: 'completed' }]
      },
      {
        id: 'topics',
        executor: 'wechat-article',
        dependsOn: ['sources'],
        completesJob: false,
        resultVersionPolicy: 'none',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'article_sources', selector: 'latest-completed', optional: true },
          { kind: 'source_document', selector: 'latest-completed', optional: true }
        ],
        outputArtifacts: [
          { kind: 'article_sources', status: 'completed' },
          { kind: 'article_topics', status: 'completed' }
        ]
      },
      {
        id: 'outline',
        executor: 'wechat-article',
        dependsOn: ['topics'],
        completesJob: false,
        resultVersionPolicy: 'none',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'article_sources', selector: 'latest-completed' },
          { kind: 'article_topics', selector: 'latest-completed' }
        ],
        outputArtifacts: [{ kind: 'article_outline', status: 'completed' }]
      },
      {
        id: 'article',
        executor: 'wechat-article',
        dependsOn: ['outline'],
        completesJob: false,
        resultVersionPolicy: 'none',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'article_sources', selector: 'latest-completed' },
          { kind: 'article_topics', selector: 'latest-completed' },
          { kind: 'article_outline', selector: 'latest-completed' }
        ],
        outputArtifacts: [{ kind: 'article_markdown', status: 'completed' }]
      },
      {
        id: 'images',
        executor: 'wechat-article',
        dependsOn: ['article'],
        optional: true,
        completesJob: false,
        resultVersionPolicy: 'snapshot',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'article_markdown', selector: 'latest-completed' }
        ],
        outputArtifacts: [{ kind: 'article_image', status: 'completed' }]
      },
      {
        id: 'document',
        executor: 'wechat-article',
        dependsOn: ['article'],
        resultVersionPolicy: 'snapshot',
        allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
        inputArtifacts: [
          { kind: 'article_markdown', selector: 'latest-completed' },
          { kind: 'article_image', selector: 'latest-completed', optional: true }
        ],
        outputArtifacts: [{ kind: 'article_document', status: 'completed' }]
      }
    ],
    actions: [
      {
        id: 'update-settings',
        inputSchema: record,
        allowedStages: ['sources', 'topics', 'outline', 'article', 'images', 'document']
      },
      {
        id: 'run-stage',
        inputSchema: record,
        allowedStages: ['sources', 'topics', 'outline', 'article', 'images', 'document']
      },
      {
        id: 'undo-action',
        inputSchema: record,
        allowedStages: ['sources', 'topics', 'outline', 'article', 'images', 'document']
      }
    ],
    outputs: [{ kind: 'article_document', required: true }],
    agentGuidance: [
      '帮助用户完成微信公众号文章写作。',
      '来源可以为空，也可以包含 sourceLinks 和 sourceDocumentArtifactIds；有来源时先运行 sources 读取网页、文档或视频字幕。',
      '再运行 topics 生成多个选题，用户确认 selectedTopicId 后运行 outline，再确认大纲并运行 article；用户完成编辑和排版后运行 document 生成最终文档。',
      '用户可编辑 topics、outline、articleMarkdown、presetId、layoutStyleId、templatePrompt、articleImageCount、articleImageStyleId 和 articleImagePrompt；文章编辑阶段可按需运行 images 自动生成配图。',
      '最终交付必须是 article_document 文档产物，内容与用户确认的 articleMarkdown 一致。'
    ].join(' ')
  };
}

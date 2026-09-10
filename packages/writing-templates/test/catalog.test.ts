import { describe, expect, it } from 'vitest';
import {
  getWritingTemplate,
  getWritingTemplateStagePrompt,
  localizeWritingTemplate,
  normalizeWritingTemplateId,
  writingTemplates
} from '../src/index.js';

describe('writing template catalog', () => {
  it('publishes official and reviewed community templates with unique ids', () => {
    expect(writingTemplates).toHaveLength(7);
    expect(writingTemplates.map(template => template.id)).toEqual([
      'community.sun-style-writing',
      'community.khazix-writer',
      'community.research-paper-writing',
      'insight',
      'story',
      'tutorial',
      'news-analysis'
    ]);
    expect(new Set(writingTemplates.map(template => template.id)).size).toBe(writingTemplates.length);
    expect(writingTemplates.every(template => ['verified', 'featured'].includes(template.status))).toBe(true);
    expect(writingTemplates.filter(template => template.source.type === 'github').every(template => template.status === 'featured')).toBe(true);
    expect(Object.isFrozen(writingTemplates)).toBe(true);
  });

  it('pins and attributes the adapted community template', () => {
    const template = getWritingTemplate('community.sun-style-writing');
    expect(template).toMatchObject({
      name: '孙割写作.skill',
      source: {
        type: 'github',
        repository: 'KKKKhazix/sun-style-writing',
        revision: 'fe970dc15113ea0c3807f19f1d3118f63f9d9079',
        license: 'MIT'
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it('normalizes renamed community template ids', () => {
    expect(normalizeWritingTemplateId('community.restrained-narrative')).toBe('community.sun-style-writing');
    expect(getWritingTemplate('community.restrained-narrative')?.id).toBe('community.sun-style-writing');
  });

  it('preserves the upstream khazix-writer name and source', () => {
    const template = getWritingTemplate('community.khazix-writer');
    expect(template).toMatchObject({
      name: '卡兹克公众号长文写作',
      author: '数字生命卡兹克',
      source: {
        type: 'github',
        repository: 'KKKKhazix/khazix-skills',
        revision: '7a5c4934be4106ac740ffdb95280bb81b3f4b83c',
        license: 'MIT'
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it('preserves the upstream research paper template name, source, and research domain', () => {
    const template = getWritingTemplate('community.research-paper-writing');
    expect(template).toMatchObject({
      name: 'Research Paper Writing',
      author: 'Master-cai / OpenCreator adapted',
      domains: ['research'],
      source: {
        type: 'github',
        repository: 'Master-cai/Research-Paper-Writing-Skills',
        revision: '77e7c2c1ba06f7d71844873147665437a03aac1b',
        license: 'MIT'
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(localizeWritingTemplate(template!, 'zh-CN')).toMatchObject({
      name: '科研论文写作',
      description: '用清晰章节、严密论证和审稿人视角组织科研论文与学术内容'
    });
    expect(localizeWritingTemplate(template!, 'en-US')).toMatchObject({
      name: 'Research Paper Writing',
      description: 'Structure research papers with clear sections, rigorous arguments, and a reviewer\'s perspective'
    });
  });

  it('localizes templates whose canonical names are Chinese', () => {
    const template = getWritingTemplate('community.khazix-writer');
    expect(localizeWritingTemplate(template!, 'en-US')).toMatchObject({
      name: 'Khazix Long-form WeChat Writing',
      tags: ['Long-form article', 'Conversational rhythm', 'Real experience', 'Opinion narrative']
    });
  });

  it('loads only the resources needed by each writing stage', () => {
    const topicPrompt = getWritingTemplateStagePrompt('community.sun-style-writing', 'topics');
    const articlePrompt = getWritingTemplateStagePrompt('community.sun-style-writing', 'article');

    expect(topicPrompt).toContain('选题规则');
    expect(topicPrompt).not.toContain('成稿检查');
    expect(articlePrompt).toContain('孙学写作法');
    expect(articlePrompt).toContain('成稿检查');

    const khazixTopicPrompt = getWritingTemplateStagePrompt('community.khazix-writer', 'topics');
    const khazixArticlePrompt = getWritingTemplateStagePrompt('community.khazix-writer', 'article');
    expect(khazixTopicPrompt).toContain('HKR 质检');
    expect(khazixArticlePrompt).toContain('卡兹克公众号长文写作');
    expect(khazixArticlePrompt).toContain('四层质检');

    const researchTopicPrompt = getWritingTemplateStagePrompt('community.research-paper-writing', 'topics');
    const researchArticlePrompt = getWritingTemplateStagePrompt('community.research-paper-writing', 'article');
    expect(researchTopicPrompt).toContain('科研选题判断');
    expect(researchArticlePrompt).toContain('Research Paper Writing');
    expect(researchArticlePrompt).toContain('投稿前审稿式检查');
  });
});

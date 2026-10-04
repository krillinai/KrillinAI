import { describe, expect, it } from 'vitest';
import { imagePromptRequiresReference } from '../src/media-generation.js';

describe('explicit image reference requirements', () => {
  it.each([
    '以上传的人物照片为唯一主体与场景参考，生成复古海报。',
    '参考上传图片的主体和构图生成新画面',
    '保持原图的人物身份和服装',
    '将参考图改成水彩画',
    '基于参考图生成海报',
    'Preserve the identity in the uploaded person photo.',
    'Edit the attached image into a poster.',
    'Use this photo as the reference.'
  ])('requires a reference for %s', prompt => {
    expect(imagePromptRequiresReference(prompt)).toBe(true);
  });

  it.each([
    '', '生成一张猫的真实摄影照片', '生成一张角色设计参考图',
    '无需上传图片，生成一张风景照', '不需要参考图，画一只橘猫',
    'Create a realistic photo of a studio.', 'Generate a cat without any reference image.'
  ])('allows text-only generation for %s', prompt => {
    expect(imagePromptRequiresReference(prompt)).toBe(false);
  });
});

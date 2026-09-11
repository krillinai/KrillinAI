import { describe, expect, it, vi } from 'vitest';
import { analyzeClips, parseClipCandidates } from '../../src/creator/clip/analyzer.js';

describe('clip analyzer', () => {
  it('passes content settings and candidate limits to the model prompt', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      expect(request.messages[0]!.content).toContain('优先寻找开头抓人');
      expect(request.messages[0]!.content).toContain('最多 1 个片段');
      expect(request.messages[0]!.content).toContain('30-60 秒');
      expect(request.messages[0]!.content).toContain('内容类型：教程或知识讲解');
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              candidates: [
                candidate('short', 0, 20),
                candidate('selected', 25, 60),
                candidate('extra', 65, 110)
              ]
            })
          }
        }]
      }), { status: 200 });
    });

    const result = await analyzeClips({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.test/v1',
      model: 'test-model',
      transcript: '这是一段用于验证高光识别设置的字幕。',
      duration: 120,
      focus: 'viral',
      genre: 'tutorial',
      minDuration: 30,
      maxDuration: 60,
      count: 1,
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result.map(item => item.id)).toEqual(['selected']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate candidate ids before rendering', () => {
    expect(() => parseClipCandidates({
      candidates: [candidate('duplicate', 0, 20), candidate('duplicate', 25, 50)]
    }, 60)).toThrow(/duplicate_clip_id/);
  });
});

function candidate(id: string, start: number, end: number) {
  return {
    id,
    title: `片段 ${id}`,
    start,
    end,
    transcript: `片段 ${id} 的完整字幕`,
    reason: `片段 ${id} 可以独立传播`,
    scores: {
      hook: 92,
      information: 88,
      emotion: 84,
      completeness: 90
    }
  };
}

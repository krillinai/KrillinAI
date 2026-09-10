import { z } from 'zod';

const candidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  transcript: z.string().min(1),
  reason: z.string().min(1),
  scores: z.object({
    hook: z.number().min(0).max(100),
    information: z.number().min(0).max(100),
    emotion: z.number().min(0).max(100),
    completeness: z.number().min(0).max(100)
  }).strict()
}).strict();

const responseSchema = z.object({ candidates: z.array(candidateSchema) }).strict();
export type ClipCandidate = z.infer<typeof candidateSchema>;

export function parseClipCandidates(value: unknown, duration: number): ClipCandidate[] {
  const parsed = responseSchema.parse(value);
  const sorted = parsed.candidates.slice().sort((a, b) => a.start - b.start);
  for (let index = 0; index < sorted.length; index += 1) {
    const candidate = sorted[index]!;
    if (candidate.end <= candidate.start || candidate.end > duration) throw new Error(`invalid_clip_range: ${candidate.id}`);
    if (sorted.some((item, itemIndex) => itemIndex !== index && item.id === candidate.id)) {
      throw new Error(`duplicate_clip_id: ${candidate.id}`);
    }
    if (index > 0 && candidate.start < sorted[index - 1]!.end) throw new Error(`overlapping_clip_range: ${candidate.id}`);
  }
  return sorted;
}

export async function analyzeClips(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  transcript: string;
  duration: number;
  focus: 'balanced' | 'viral' | 'knowledge';
  minDuration: number;
  maxDuration: number;
  count: number;
  fetchImpl?: typeof fetch;
}): Promise<ClipCandidate[]> {
  const response = await (input.fetchImpl ?? fetch)(`${input.baseUrl.replace(/\/$/, '') || 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: buildClipAnalysisPrompt(input)
      }]
    })
  });
  if (!response.ok) throw new Error(`clip_analyzer_failed: HTTP ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('clip_analyzer_invalid_response');
  const parsed = parseClipCandidates(JSON.parse(content), input.duration)
    .filter(candidate => {
      const duration = candidate.end - candidate.start;
      return duration >= input.minDuration && duration <= input.maxDuration;
    })
    .slice(0, input.count);
  if (parsed.length === 0) throw new Error('clip_analyzer_no_candidates');
  return parsed;
}

function buildClipAnalysisPrompt(input: {
  transcript: string;
  duration: number;
  focus: 'balanced' | 'viral' | 'knowledge';
  minDuration: number;
  maxDuration: number;
  count: number;
}): string {
  const focus = input.focus === 'viral'
    ? '优先寻找开头抓人、情绪明确、适合社交平台独立传播的片段'
    : input.focus === 'knowledge'
      ? '优先寻找观点完整、信息密度高、无需上下文也能理解的知识片段'
      : '平衡开头吸引力、信息价值、情绪强度和观点完整度';
  return [
    '你是短视频剪辑分析器。请从字幕中选择互不重叠、脱离原视频也能独立成立的高光片段。',
    `分析偏好：${focus}。`,
    `返回最多 ${input.count} 个片段，每个片段时长必须在 ${input.minDuration}-${input.maxDuration} 秒之间。`,
    '标题要简洁具体；transcript 必须是该时间范围内可直接展示给用户的完整字幕；reason 解释它为什么适合作为短视频。',
    '四项评分均使用 0-100 的整数：hook 开头吸引力，information 信息价值，emotion 情绪强度，completeness 观点完整度。',
    '只输出严格 JSON，不要 Markdown：',
    '{"candidates":[{"id":"clip-1","title":"...","start":0,"end":30,"transcript":"...","reason":"...","scores":{"hook":0,"information":0,"emotion":0,"completeness":0}}]}',
    `媒体总时长：${input.duration} 秒。`,
    `字幕：\n${input.transcript}`
  ].join('\n');
}

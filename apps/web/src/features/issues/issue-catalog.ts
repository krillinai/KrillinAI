import type { OpenCreatorIssue } from '@opencreator/protocol';

export type IssuePresentation = {
  title: string;
  description: string;
  diagnosticLabel: string;
  statusLabel: string;
};

const catalog: Record<string, { zh: string; en: string }> = {
  'issue.configuration': { zh: '配置不完整', en: 'Configuration required' },
  'issue.input': { zh: '输入无法处理', en: 'Input could not be processed' },
  'issue.permission': { zh: '权限不足', en: 'Permission required' },
  'issue.network': { zh: '连接失败', en: 'Connection failed' },
  'issue.provider': { zh: '外部服务失败', en: 'Provider failed' },
  'issue.execution': { zh: '操作未完成', en: 'Operation did not complete' },
  'issue.output-validation': { zh: '输出未通过检查', en: 'Output validation failed' },
  'issue.unknown': { zh: '发生问题', en: 'Something went wrong' },
  'issue.upload_failed': { zh: '上传失败', en: 'Upload failed' },
  'issue.translation_language_mismatch': { zh: '翻译结果语言不正确', en: 'Translation output language is incorrect' }
};

export function presentIssue(
  issue: OpenCreatorIssue,
  language: 'zh-CN' | 'en-US' = 'zh-CN'
): IssuePresentation {
  const entry = catalog[issue.summaryKey] ?? catalog[`issue.${issue.category}`] ?? catalog['issue.unknown']!;
  const resolved = issue.status === 'resolved';
  const resolving = issue.status === 'resolving';
  return {
    title: language === 'en-US' ? entry.en : entry.zh,
    description: safeFallback(issue.fallbackMessage, language),
    diagnosticLabel: language === 'en-US'
      ? `Diagnostic ID: ${issue.diagnosticId}`
      : `诊断编号：${issue.diagnosticId}`,
    statusLabel: language === 'en-US'
      ? resolved ? 'Resolved' : resolving ? 'Resolving' : 'Needs attention'
      : resolved ? '已解决' : resolving ? '处理中' : '需要处理'
  };
}

function safeFallback(value: string, language: 'zh-CN' | 'en-US'): string {
  const normalized = value
    .replace(/(?:authorization|api[-_ ]?key|token|secret)\s*[:=]\s*\S+/gi, '[已隐藏]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, '[用户目录]')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '[用户目录]')
    .replace(/\s+at\s+[^\n]+(?:\n|$)/g, ' ')
    .trim()
    .slice(0, 500);
  if (normalized.length > 0) return normalized;
  return language === 'en-US' ? 'The operation did not complete.' : '操作未完成，请重试。';
}

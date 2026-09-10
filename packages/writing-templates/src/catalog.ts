import generatedCatalog from './generated/catalog.json' with { type: 'json' };
import type { WritingTemplate, WritingTemplateLocale, WritingTemplateStage } from './types.js';

export const writingTemplates: readonly WritingTemplate[] = deepFreeze(
  structuredClone(generatedCatalog) as WritingTemplate[]
);

const writingTemplateIdAliases: Readonly<Record<string, string>> = Object.freeze({
  'community.restrained-narrative': 'community.sun-style-writing'
});

export function normalizeWritingTemplateId(id: string): string {
  return writingTemplateIdAliases[id] ?? id;
}

export function getWritingTemplate(id: string): WritingTemplate | undefined {
  const normalizedId = normalizeWritingTemplateId(id);
  return writingTemplates.find(template => template.id === normalizedId);
}

export function getWritingTemplateStagePrompt(id: string, stage: WritingTemplateStage): string {
  return getWritingTemplate(id)?.stagePrompts[stage]?.trim() ?? '';
}

export function localizeWritingTemplate(template: WritingTemplate, locale: WritingTemplateLocale): WritingTemplate {
  return {
    ...template,
    ...template.localizations[locale]
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

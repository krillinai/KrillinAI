export type WritingTemplateCategoryId = 'analysis' | 'story' | 'practical' | 'news';

export type WritingTemplateDomainId = 'technology' | 'finance' | 'emotion' | 'workplace' | 'education' | 'research' | 'lifestyle';

export type WritingTemplateStatus = 'submitted' | 'verified' | 'featured' | 'deprecated';

export type WritingTemplateStage = 'topics' | 'outline' | 'article' | 'review';

export type WritingTemplateLocale = 'zh-CN' | 'en-US';

export type WritingTemplateLocalization = {
  name: string;
  description: string;
  tags: readonly string[];
  structure: readonly string[];
  instructions: string;
};

export type WritingTemplateSource = {
  type: 'official' | 'github';
  repository: string | null;
  revision: string | null;
  url: string | null;
  license: string;
};

export type WritingTemplateManifest = {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  localizations: Readonly<Record<WritingTemplateLocale, WritingTemplateLocalization>>;
  categoryId: WritingTemplateCategoryId;
  domains: readonly WritingTemplateDomainId[];
  tags: readonly string[];
  structure: readonly string[];
  instructions: string;
  author: string;
  status: WritingTemplateStatus;
  sortOrder: number;
  source: WritingTemplateSource;
};

export type WritingTemplate = WritingTemplateManifest & {
  contentHash: string;
  stagePrompts: Readonly<Partial<Record<WritingTemplateStage, string>>>;
};

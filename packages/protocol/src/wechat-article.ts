export const wechatArticlePresetIds = [
  'insight',
  'story',
  'tutorial',
  'news-analysis'
] as const;

export type WechatArticlePresetId = string;

export const wechatArticlePresetCategoryIds = [
  'analysis',
  'story',
  'practical',
  'news'
] as const;

export type WechatArticlePresetCategoryId = typeof wechatArticlePresetCategoryIds[number];

export const wechatArticleLayoutStyleIds = [
  'minimal',
  'business',
  'editorial',
  'vibrant',
  'technical',
  'podcast',
  'newsroom'
] as const;

export type WechatArticleLayoutStyleId = typeof wechatArticleLayoutStyleIds[number];

export type WechatArticleSourceLink = {
  id: string;
  url: string;
  kind: 'video' | 'webpage';
  label: string;
};

export const wechatArticleSourceLimit = 10;

export type WechatArticleTopic = {
  id: string;
  title: string;
  angle: string;
  summary: string;
};

export const wechatArticleImageStyleIds = [
  'editorial',
  'minimal',
  'documentary',
  'illustration',
  'three-dimensional',
  'infographic'
] as const;

export type WechatArticleImageStyleId = typeof wechatArticleImageStyleIds[number];

export const wechatArticleImageStyles: ReadonlyArray<{
  id: WechatArticleImageStyleId;
  instructions: string;
}> = [
  {
    id: 'editorial',
    instructions: 'Editorial magazine visual, deliberate composition, restrained color contrast, strong focal subject, polished publication quality.'
  },
  {
    id: 'minimal',
    instructions: 'Minimal conceptual visual, generous negative space, few objects, clean geometry, refined neutral palette, clear visual metaphor.'
  },
  {
    id: 'documentary',
    instructions: 'Documentary photography, natural light, credible real-world environment, candid details, restrained color grading, no staged stock-photo look.'
  },
  {
    id: 'illustration',
    instructions: 'Contemporary editorial illustration, textured shapes, expressive but controlled color, clear narrative scene, sophisticated print quality.'
  },
  {
    id: 'three-dimensional',
    instructions: 'isometric 3D illustration, futuristic tech scene, floating platforms connected by glowing lines, central AI cube core, neon blue purple gradient background, soft lighting, glass material, minimal composition, clean, no text, high detail, 3:2.'
  },
  {
    id: 'infographic',
    instructions: 'Editorial data visualization, clear hierarchy, diagrams and visual relationships, minimal labels, accurate structure, clean publication layout.'
  }
];

export type WechatArticleImagePlanItem = {
  id: string;
  caption: string;
  placementHeading: string;
  prompt: string;
};

export const wechatArticleLayoutCategoryIds = [
  'recommended',
  'technology',
  'business',
  'news',
  'lifestyle',
  'humanities'
] as const;

export type WechatArticleLayoutCategoryId = typeof wechatArticleLayoutCategoryIds[number];

export const wechatArticleLayoutStyles: ReadonlyArray<{
  id: WechatArticleLayoutStyleId;
  categories: readonly WechatArticleLayoutCategoryId[];
  name: string;
  description: string;
  features: readonly string[];
  instructions: string;
}> = [
  {
    id: 'minimal',
    categories: ['recommended', 'technology', 'lifestyle'],
    name: '知识手记',
    description: '清爽但不单薄，适合观点、复盘与知识分享',
    features: ['编号章节', '结论卡片', '阅读留白'],
    instructions: '使用知识手记式 Markdown 结构。一级标题后用一段加粗导语概括核心判断；主体使用带 01、02、03 编号的二级标题；每节保持二到四个短段落。重要结论使用引用块形成结论卡片，操作要点使用列表，重要转场使用分隔线。结尾用一个简短的行动清单或总结收束。不要堆叠装饰符号。'
  },
  {
    id: 'business',
    categories: ['recommended', 'business'],
    name: '商业报告',
    description: '摘要先行、数据醒目，适合行业与公司内容',
    features: ['内容摘要', '数据重点', '结论边栏'],
    instructions: '使用商业报告式 Markdown 结构。一级标题后先写一段加粗的执行摘要；二级标题直接表达章节结论，三级标题用于拆分论据。数据、对比和关键事实优先使用列表或表格；引用块只承载关键判断或风险提示；章节之间使用分隔线。语气专业克制，结尾明确列出三项以内的决策建议或后续观察。'
  },
  {
    id: 'editorial',
    categories: ['lifestyle', 'humanities'],
    name: '杂志特写',
    description: '叙事舒展、金句突出，适合人物与深度故事',
    features: ['题记导语', '叙事章节', '金句引用'],
    instructions: '使用杂志特写式 Markdown 结构。一级标题简洁有叙事张力，随后用一段加粗的题记或导语建立场景；正文段落有长短变化，二级标题写成有画面感的章节标题。关键句单独使用引用块，重要转场使用分隔线；列表只在确有并列信息时使用。结尾回扣开篇场景或核心意象，保留余味，不使用教程式口号。'
  },
  {
    id: 'vibrant',
    categories: ['recommended', 'lifestyle', 'humanities'],
    name: '行动清单',
    description: '步骤鲜明、重点醒目，适合方法与实操内容',
    features: ['步骤模块', '提示便签', '完成清单'],
    instructions: '使用行动清单式 Markdown 结构。开篇先说明读者问题和完成后的收益；主体优先使用清晰的步骤编号和动作导向的二级标题。每一步包含目的、操作和注意事项；关键提醒使用引用块，检查项使用任务清单或无序列表，必要时用加粗突出动作。结尾提供可立即执行的完成清单。不要使用大量 emoji 或夸张符号。'
  },
  {
    id: 'technical',
    categories: ['recommended', 'technology', 'business'],
    name: '技术教程',
    description: '代码、参数和步骤层次清楚，适合产品与开发教程',
    features: ['步骤导航', '代码区块', '避坑提示'],
    instructions: '使用技术教程式 Markdown 结构。一级标题后用加粗导语说明适用对象、前置条件和最终结果；按步骤组织二级标题，三级标题解释原理或备选方案。命令、代码、配置和文件内容必须使用代码块；参数对比可使用表格；引用块用于“注意”“避坑”或兼容性提醒；结尾提供验证清单。不得编造无法由来源确认的命令、版本或配置。'
  },
  {
    id: 'podcast',
    categories: ['technology'],
    name: '播客访谈',
    description: '突出对话与原声观点，适合播客、圆桌和人物访谈',
    features: ['嘉宾发言', '对话层级', '观点摘录'],
    instructions: '使用播客访谈式 Markdown 结构。一级标题后用一段加粗导语交代节目、嘉宾和核心议题；开篇可选取二到三句最有代表性的原话作为引用块。主体使用概括核心观点的二级标题分章；需要呈现对话时，以“### 主持人 · 姓名”或“### 嘉宾 · 姓名”标明发言者，紧接引用块放置该人物的原话，不得把不同发言者合并在同一个引用块中。引用之后用普通段落补充背景、解释与事实核验。只把来源中可以确认的内容写成直接引语，不得改写后加引号或虚构发言。结尾整理节目来源、关键观点和延伸阅读。'
  },
  {
    id: 'newsroom',
    categories: ['news', 'business'],
    name: '热点简报',
    description: '先讲事实再做判断，适合新闻、事件与趋势解读',
    features: ['事实速览', '时间脉络', '影响判断'],
    instructions: '使用热点简报式 Markdown 结构。一级标题后用加粗导语在三句话内说明发生了什么、为什么重要；第一个二级章节为事实速览，用列表列出时间、主体和已确认信息；后续章节依次解释背景、影响和待观察事项。引用块用于标记核心判断，并明确区分事实与推测；分隔线用于切换事实和分析。结尾列出接下来值得关注的二到四个信号。'
  }
];

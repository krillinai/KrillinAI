import { createLocalizedCopy } from '../../i18n/localized-copy.js';
import type { AppLanguage } from '../../i18n/language.js';
import type {
  CreatorPresetSummary,
  CreatorRuntimeWorkspace
} from '@opencreator/protocol';
import {
  ChevronDown,
  Copy,
  Info,
  Play,
  Search,
  Tags,
  WandSparkles,
  UserRound,
  X
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import type { CreatorWorkspace } from '../dashboard/creator-workspace.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';
import './CreatorDashboard.css';

export type CreatorSkill = {
  id: string;
  title: string;
  category: string;
  image: string;
  interaction?: {
    type: 'workspace';
    workspace: CreatorWorkspace;
  };
  promptHint?: {
    zhCN: string;
    enUS: string;
  };
};
export { getCreatorSkillPromptHint } from './creator-skill-prompt-hint.js';

type CreatorHomeCategory = 'recent' | 'recommended' | 'all' | 'video' | 'image';
type FacetOption = {
  id: string;
  zh: string;
  en: string;
  tags: string[];
  modules?: CreatorRuntimeWorkspace[];
};

const videoTagOptions: FacetOption[] = [
  { id: 'translation', zh: '视频翻译', en: 'Video Translation', tags: [], modules: ['video-translation'] },
  { id: 'stickman-animation', zh: '火柴人动画', en: 'Stick Figure Animation', tags: ['stickman-video', 'stick-figure-animation', '火柴人动画', 'Stick figure animation'] },
  { id: 'short-film', zh: '电影短片', en: 'Cinematic Shorts', tags: ['cinematic', 'Cinematic', 'mystery', 'Mystery'] },
  { id: 'vlog', zh: '生活 Vlog', en: 'Lifestyle Vlogs', tags: ['dv', 'DV', 'ugc', 'UGC'] },
  { id: 'brand-ad', zh: '品牌广告', en: 'Brand Ads', tags: ['advertising', 'Advertising', 'jewelry', 'Jewelry'] },
  { id: 'ugc', zh: 'UGC 内容', en: 'UGC Content', tags: ['ugc', 'UGC'] },
  { id: 'tutorial', zh: '知识讲解', en: 'Explainers', tags: ['cooking', 'Cooking', 'multi-stage', 'Multi-stage'] },
  { id: 'intro', zh: '片头包装', en: 'Intros / Branding', tags: [] },
  { id: 'game-promo', zh: '游戏宣传', en: 'Game Promos', tags: [] },
  { id: 'cinematic-realism', zh: '写实电影感', en: 'Cinematic Realism', tags: ['cinematic', 'Cinematic'] },
  { id: 'fantasy', zh: '奇幻冒险', en: 'Fantasy Adventures', tags: ['fantasy', 'Fantasy'] },
  { id: 'scifi', zh: '未来科幻', en: 'Future Sci-fi', tags: ['sci-fi', 'Sci-fi'] },
  { id: 'anime', zh: '动漫风格', en: 'Anime Style', tags: ['anime-style', 'Anime style'] },
  { id: 'retro-film', zh: '复古胶片', en: 'Retro Film', tags: ['nostalgic', 'Nostalgic', 'dv', 'DV'] },
  { id: 'dreamlike', zh: '梦境视觉', en: 'Dreamlike Visuals', tags: [] },
  { id: 'stop-motion', zh: '定格动画', en: 'Stop Motion', tags: ['stop-motion', 'Stop motion'] },
  { id: 'drawn-animation', zh: '手绘动画', en: 'Hand-drawn Animation', tags: ['watercolor', 'Watercolor', '手绘插画', 'Hand-drawn illustration'] },
  { id: 'characters', zh: '人物角色', en: 'People / Characters', tags: ['character-interaction', 'Character interaction', 'first-person', 'First person', '真人贴纸', 'ugc', 'UGC'] },
  { id: 'motion-action', zh: '运动动作', en: 'Sports / Action', tags: ['action', 'Action', 'martial-arts', 'Martial arts', 'parkour', 'Parkour', 'skateboard', 'Skateboard'] },
  { id: 'landscape', zh: '自然风光', en: 'Natural Landscapes', tags: ['nature-landscape', 'Natural landscapes'] },
  { id: 'architecture', zh: '建筑空间', en: 'Architecture / Interiors', tags: ['architecture-interior', 'Architecture and interiors'] },
  { id: 'city', zh: '城市街景', en: 'City Streets', tags: ['city-street', 'City streets'] },
  { id: 'food-video', zh: '美食料理', en: 'Food / Cooking', tags: ['cooking', 'Cooking'] },
  { id: 'product-video', zh: '产品特写', en: 'Product Close-ups', tags: ['advertising', 'Advertising', 'jewelry', 'Jewelry'] },
  { id: 'camera-video', zh: '镜头运动', en: 'Camera Motion', tags: ['camera-motion', 'Camera motion', 'rack-focus', 'Rack focus', 'drone-orbit', 'Drone orbit', 'dolly-zoom', 'Dolly zoom', 'crane-up', 'Crane up', 'pan-right', 'Pan right', 'aerial', 'Aerial'] },
  { id: 'dubbing', zh: '视频配音', en: 'Video Dubbing', tags: [], modules: ['smart-dubbing'] },
  { id: 'download', zh: '视频下载', en: 'Video Downloads', tags: [], modules: ['video-download'] }
];

const imageTagOptions: FacetOption[] = [
  { id: 'image-portrait', zh: '人像写真', en: 'Portraits', tags: ['人像摄影', 'Portrait photography', 'portrait', 'Portrait'] },
  { id: 'image-social', zh: '社交帖子', en: 'Social Posts', tags: ['社交媒体', 'Social media', 'social', 'Social'] },
  { id: 'image-infographic', zh: '信息图解', en: 'Infographics', tags: ['信息图表', 'Infographics', '教育科普', 'Educational content'] },
  { id: 'image-thumbnail', zh: '视频封面', en: 'Video Thumbnails', tags: ['视频缩略图', 'Video thumbnails', 'youtube', 'YouTube', 'cover', 'Cover'] },
  { id: 'image-storyboard', zh: '故事分镜', en: 'Storyboards', tags: ['storyboard', 'Storyboard'] },
  { id: 'image-ad', zh: '品牌广告', en: 'Brand Ads', tags: ['商业广告', 'Commercial advertising', 'advertising', 'Advertising'] },
  { id: 'image-ecommerce', zh: '电商主图', en: 'E-commerce', tags: ['电商视觉', 'E-commerce visuals', 'ecommerce', 'E-commerce'] },
  { id: 'image-game', zh: '游戏视觉', en: 'Game Art', tags: ['游戏视觉', 'Game visuals'] },
  { id: 'image-poster', zh: '海报设计', en: 'Posters', tags: ['海报设计', 'Poster design', '活动物料', 'Event collateral', 'poster', 'Poster'] },
  { id: 'image-web', zh: '网页设计', en: 'Web Design', tags: ['网页界面', 'Web interfaces'] },
  { id: 'image-photography', zh: '摄影', en: 'Photography', tags: ['人像摄影', 'Portrait photography', '创意摄影', 'Creative photography', '产品摄影', 'Product photography'] },
  { id: 'image-cinematic', zh: '电影感', en: 'Cinematic', tags: ['cinematic', 'Cinematic', '电影感'] },
  { id: 'image-anime', zh: '动漫插画', en: 'Anime Illustration', tags: ['anime-style', 'Anime style'] },
  { id: 'image-illustration', zh: '手绘插画', en: 'Hand-drawn Art', tags: ['手绘插画', 'Hand-drawn illustration', '概念艺术', 'Concept art'] },
  { id: 'image-3d', zh: '三维场景', en: '3D Scenes', tags: ['3d-render', '3D render', '等轴测', 'Isometric', '微缩场景', 'Miniature scenes'] },
  { id: 'image-collage', zh: '拼贴手作', en: 'Collage / Craft', tags: ['拼贴设计', 'Collage design', '手工材质', 'Handcrafted textures'] },
  { id: 'image-watercolor', zh: '水彩画', en: 'Watercolor', tags: ['watercolor', 'Watercolor'] },
  { id: 'image-traditional', zh: '国风美学', en: 'Chinese-inspired', tags: ['传统文化', 'Traditional culture'] },
  { id: 'image-retro', zh: '复古怀旧', en: 'Retro', tags: ['nostalgic', 'Nostalgic'] },
  { id: 'image-future', zh: '未来科技', en: 'Futuristic', tags: ['未来科技', 'Future technology'] },
  { id: 'image-minimal', zh: '极简设计', en: 'Minimalist', tags: ['minimalist', 'Minimalist'] },
  { id: 'image-people', zh: '人物角色', en: 'People / Characters', tags: ['人像摄影', 'Portrait photography', '角色场景', 'Character scenes', '真人贴纸', 'Real-person stickers'] },
  { id: 'image-product', zh: '商品产品', en: 'Products', tags: ['产品视觉', 'Product visuals', '产品摄影', 'Product photography', '电商视觉', 'E-commerce visuals', '工业设计', 'Industrial design', 'product', 'Product'] },
  { id: 'image-food', zh: '美食饮品', en: 'Food / Drink', tags: ['食品饮料', 'Food and beverage'] },
  { id: 'image-fashion', zh: '时尚穿搭', en: 'Fashion / Beauty', tags: ['时尚美妆', 'Fashion and beauty'] },
  { id: 'image-architecture', zh: '建筑空间', en: 'Architecture', tags: ['建筑空间', 'Architecture and interiors'] },
  { id: 'image-city', zh: '城市街景', en: 'City Streets', tags: ['city-street', 'City streets'] },
  { id: 'image-nature', zh: '自然植物', en: 'Nature / Plants', tags: ['自然植物', 'Nature and botanicals'] },
  { id: 'image-maps', zh: '地图图表', en: 'Maps / Charts', tags: ['地图视觉', 'Map visuals', '信息图表', 'Infographics'] },
  { id: 'image-type', zh: '文字排版', en: 'Typography', tags: ['文本排版', 'Text layout', '编辑设计', 'Editorial design'] }
];

const categoryOrder: CreatorHomeCategory[] = [
  'recent',
  'recommended',
  'all',
  'video',
  'image'
];
const videoModules = new Set<CreatorRuntimeWorkspace>([
  'video-translation',
  'video-download',
  'video-generation',
  'smart-dubbing'
]);
const imageModules = new Set<CreatorRuntimeWorkspace>([
  'image-generation',
  'cover-generator'
]);
const recentPresetStorageKey = 'opencreator.creator-presets.recent.v1';
const recentPresetLimit = 12;

export function CreatorDashboard(props: {
  presets?: CreatorPresetSummary[];
  loading?: boolean;
  error?: string;
  onRetry?(): void;
  onSelectPreset?(preset: CreatorPresetSummary): Promise<void> | void;
  onSelectSkill?(skill: CreatorSkill): void;
}) {
  const { language } = useAppLanguage();
  const [category, setCategory] = useState<CreatorHomeCategory>('recommended');
  const [selectedTag, setSelectedTag] = useState<string>();
  const [visibleTagCount, setVisibleTagCount] = useState(Infinity);
  const [moreTagsOpen, setMoreTagsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPresetIdentity, setSelectedPresetIdentity] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptHasOverflow, setPromptHasOverflow] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>(readRecentPresetIds);
  const [busyIdentities, setBusyIdentities] = useState<Set<string>>(
    () => new Set()
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailPageRef = useRef<HTMLDivElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLCanvasElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const tagsFilterRef = useRef<HTMLDivElement>(null);
  const tagsMeasureRef = useRef<HTMLDivElement>(null);
  const moreTagsButtonRef = useRef<HTMLButtonElement>(null);
  const busyIdentitiesRef = useRef(new Set<string>());
  const pageIssues = usePageIssueState('creator-launch');
  const presets = props.presets ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const categoryPresets = useMemo(() => {
    if (category === 'recent') {
      const presetsById = new Map(presets.map(preset => [presetIdentity(preset), preset]));
      return recentPresetIds.flatMap(identity => {
        const preset = presetsById.get(identity);
        return preset === undefined ? [] : [preset];
      });
    }
    if (category === 'recommended') return presets.filter(preset => preset.featured);
    if (category === 'all') return presets;
    const modules = category === 'video' ? videoModules : imageModules;
    return presets.filter(preset => modules.has(preset.module));
  }, [category, presets, recentPresetIds]);
  const categoryTagOptions = category === 'video'
    ? videoTagOptions
    : category === 'image'
      ? imageTagOptions
      : [];
  const availableTagOptions = categoryTagOptions.filter(option => (
    categoryPresets.some(preset => matchesFacet(preset, option))
  ));
  const pinnedTag = availableTagOptions.findIndex(option => option.id === selectedTag) >= visibleTagCount
    ? selectedTag
    : undefined;
  const orderedTagOptions = pinnedTag === undefined
    ? availableTagOptions
    : [
        ...availableTagOptions.filter(option => option.id === pinnedTag),
        ...availableTagOptions.filter(option => option.id !== pinnedTag)
      ];
  const visibleTagOptions = orderedTagOptions.slice(0, visibleTagCount);
  const overflowTagOptions = orderedTagOptions.slice(visibleTagCount);
  const availableTagKey = orderedTagOptions.map(option => option.id).join('|');
  const visiblePresets = useMemo(() => categoryPresets.filter(preset => (
    (selectedTag === undefined
      || categoryTagOptions.some(option => option.id === selectedTag && matchesFacet(preset, option)))
    && (normalizedQuery === ''
      || `${preset.title} ${preset.description} ${preset.tags.join(' ')}`
        .toLocaleLowerCase()
        .includes(normalizedQuery))
  )), [categoryPresets, selectedTag, normalizedQuery, category]);
  const selectedPreset = selectedPresetIdentity === undefined
    ? undefined
    : presets.find(preset => presetIdentity(preset) === selectedPresetIdentity);
  const selectedPreviewUrl = selectedPreset?.previewUrl ?? selectedPreset?.coverUrl;
  useEffect(() => {
    const canvas = backdropRef.current;
    if (canvas === null || selectedPreviewUrl === undefined) return;
    canvas.width = 4;
    const image = new window.Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      if (context === null) return;
      context.drawImage(image, 0, 0, 4, 4);
    };
    image.src = selectedPreviewUrl;
    return () => { image.onload = null; };
  }, [selectedPreviewUrl]);
  useEffect(() => {
    setPromptCopied(false);
    setPromptExpanded(false);
    setDetailsExpanded(true);
  }, [selectedPresetIdentity]);
  useLayoutEffect(() => {
    const filter = tagsFilterRef.current;
    const measure = tagsMeasureRef.current;
    if (filter === null || measure === null) return;

    const update = () => {
      const widths = Array.from(measure.children, child => child.getBoundingClientRect().width);
      const toggleWidths = widths.splice(-2);
      widths.push(Math.max(...toggleWidths));
      const gap = Number.parseFloat(window.getComputedStyle(measure).columnGap) || 0;
      const count = fitTagCount(widths, filter.getBoundingClientRect().width, gap);
      setVisibleTagCount(count);
      if (count === availableTagOptions.length) setMoreTagsOpen(false);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(filter);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [availableTagKey, language]);

  useEffect(() => {
    if (!moreTagsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!tagsFilterRef.current?.contains(event.target as Node)) setMoreTagsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreTagsOpen(false);
      moreTagsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreTagsOpen]);
  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    window.setTimeout(() => previewTriggerRef.current?.focus(), 0);
  }, []);
  useEffect(() => {
    if (props.error === undefined) {
      pageIssues.resolveOperation('creator-launch.load-presets');
      return;
    }
    pageIssues.captureOperationFailure(
      'creator-launch.load-presets',
      new Error(props.error),
      createLocalizedCopy(language)('无法加载创作模板，请检查 Runtime 连接后重试。', 'Could not load creator templates. Check the Runtime connection and retry.'),
      { retryable: props.onRetry !== undefined }
    );
  }, [
    language,
    pageIssues.captureOperationFailure,
    pageIssues.resolveOperation,
    props.error,
    props.onRetry
  ]);
  const updatePromptOverflow = useCallback(() => {
    const prompt = promptRef.current;
    if (prompt === null) return;
    const hasOverflow = prompt.scrollHeight > prompt.clientHeight + 1;
    setPromptHasOverflow(hasOverflow);
  }, []);

  useEffect(() => {
    if (!previewOpen || selectedPreset === undefined) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        previewCloseRef.current?.focus();
      }
    };
    previewCloseRef.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePreview, previewOpen, selectedPreset]);

  useLayoutEffect(() => {
    if (selectedPresetIdentity === undefined) return;
    const info = detailPageRef.current?.querySelector<HTMLElement>('.creator-template-detail-info');
    if (info) info.scrollTop = 0;
  }, [selectedPresetIdentity]);

  useLayoutEffect(() => {
    if (selectedPresetIdentity === undefined || selectedPreset === undefined) return;
    const trigger = detailTriggerRef.current;
    detailCloseRef.current?.focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [selectedPresetIdentity]);

  useEffect(() => {
    if (selectedPreset === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (previewOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedPresetIdentity(undefined);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = detailPageRef.current;
      if (dialog === null) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(element => !element.hidden && element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedPreset, previewOpen]);

  useLayoutEffect(() => {
    const prompt = promptRef.current;
    if (prompt === null) {
      setPromptHasOverflow(false);
      return;
    }
    updatePromptOverflow();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updatePromptOverflow);
    observer.observe(prompt);
    return () => observer.disconnect();
  }, [selectedPreset?.prompt, promptExpanded, updatePromptOverflow]);

  function selectCategory(nextCategory: CreatorHomeCategory) {
    setCategory(nextCategory);
    setSelectedTag(undefined);
    setMoreTagsOpen(false);
    setQuery('');
    setSearchOpen(false);
  }

  async function selectPreset(preset: CreatorPresetSummary) {
    const identity = presetIdentity(preset);
    if (busyIdentitiesRef.current.has(identity)) return;
    busyIdentitiesRef.current.add(identity);
    setBusyIdentities(new Set(busyIdentitiesRef.current));
    try {
      await props.onSelectPreset?.(preset);
      pageIssues.resolveOperation('creator-launch.select-preset');
      const storedRecentPresetIds = readRecentPresetIds();
      const nextRecentPresetIds = [
        identity,
        ...storedRecentPresetIds.filter(item => item !== identity)
      ].slice(0, recentPresetLimit);
      writeRecentPresetIds(nextRecentPresetIds);
      setRecentPresetIds(nextRecentPresetIds);
    } catch (error) {
      pageIssues.captureOperationFailure(
        'creator-launch.select-preset',
        error,
        createLocalizedCopy(language)('无法启动此模板，请查看诊断后重试。', 'Could not start this template. Check the diagnosis and retry.'),
        { retryable: true }
      );
    } finally {
      busyIdentitiesRef.current.delete(identity);
      setBusyIdentities(new Set(busyIdentitiesRef.current));
    }
  }

  const detail = selectedPreset === undefined ? null : (() => {
    const closeDetails = () => {
      setPreviewOpen(false);
      setSelectedPresetIdentity(undefined);
    };
    const identity = presetIdentity(selectedPreset);
    const busy = busyIdentities.has(identity);
    const previewUrl = selectedPreset.previewUrl ?? selectedPreset.coverUrl;
    const detailRows = selectedPreset.details ?? selectedPreset.highlights.map((highlight, index) => ({
      ...highlight,
      label: createLocalizedCopy(language)(`配置 ${index + 1}`, `Setting ${index + 1}`)
    }));
    const authorAvatar = selectedPreset.author === undefined ? null : (
      <>
        {selectedPreset.author.avatarUrl === undefined ? null : (
          <img src={selectedPreset.author.avatarUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} />
        )}
        <UserRound size={17} aria-hidden="true" />
      </>
    );
    const authorLinkLabel = createLocalizedCopy(language)(`查看${selectedPreset.author?.name}的原始来源`, `View original source from ${selectedPreset.author?.name}`);
    return (
      <>
        <div className="creator-template-detail-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget) {
            closeDetails();
          }
        }}>
        <div ref={detailPageRef} className="creator-dashboard creator-template-detail-page" role="dialog" aria-modal="true" aria-label={selectedPreset.title}>
        <div className="creator-template-detail-layout">
          <section
            className="creator-template-outcome"
            aria-label={createLocalizedCopy(language)('示例图片', 'Example result')}
            onClick={event => {
              if (event.target instanceof Element && event.target.closest('img, video') === null) closeDetails();
            }}
          >
            <canvas ref={backdropRef} className="creator-template-outcome-backdrop" width="4" height="4" aria-hidden="true" />
            {selectedPreset.previewVideoUrl === undefined ? (
              <button
                ref={previewTriggerRef}
                type="button"
                className="creator-template-outcome-media"
                aria-label={createLocalizedCopy(language)(`全屏查看${selectedPreset.title}完整作品`, `View full ${selectedPreset.title} result`)}
                title={createLocalizedCopy(language)('查看完整作品', 'View full result')}
                onClick={event => {
                  // Keyboard activation has detail 0; pointer clicks on empty space dismiss.
                  if (event.target === event.currentTarget && event.detail !== 0) return;
                  event.stopPropagation();
                  setPreviewOpen(true);
                }}
              >
                <img src={previewUrl} alt={selectedPreset.title} />
              </button>
            ) : (
              <div className="creator-template-outcome-media creator-template-outcome-video">
                <video
                  src={selectedPreset.previewVideoUrl}
                  poster={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  autoPlay
                  loop
                  aria-label={createLocalizedCopy(language)(`${selectedPreset.title}示例视频`, `${selectedPreset.title} example video`)}
                />
              </div>
            )}
          </section>

          <aside className="creator-template-detail-info">
            <header className="creator-template-detail-toolbar">
              <div className="creator-template-detail-heading">
                <h1 className={selectedPreset.author === undefined ? undefined : 'creator-template-visually-hidden'}>{selectedPreset.title}</h1>
                <p className={selectedPreset.author === undefined ? undefined : 'creator-template-visually-hidden'}>{selectedPreset.description}</p>
                {selectedPreset.author === undefined ? null : (
                  <div className="creator-template-author" aria-label={createLocalizedCopy(language)('模板作者', 'Template author')}>
                    {selectedPreset.author.url === undefined ? (
                      <span className="creator-template-author-avatar" aria-hidden="true">{authorAvatar}</span>
                    ) : (
                      <a className="creator-template-author-avatar" href={selectedPreset.author.url} target="_blank" rel="noreferrer" aria-label={authorLinkLabel} title={authorLinkLabel}>
                        {authorAvatar}
                      </a>
                    )}
                    <span className="creator-template-author-copy">
                      <strong title={selectedPreset.author.name}>{selectedPreset.author.name}</strong>
                      <small>{createLocalizedCopy(language)('作者', 'Author')}</small>
                    </span>
                  </div>
                )}
              </div>
              <button ref={detailCloseRef} type="button" className="creator-template-back" aria-label={createLocalizedCopy(language)('返回模板列表', 'Back to templates')} title={createLocalizedCopy(language)('返回模板列表', 'Back to templates')} onClick={closeDetails}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <section className="creator-template-detail-section creator-template-prompt-section">
              <div className="creator-template-prompt-card">
                <div className="creator-template-prompt-heading">
                  <h2>{createLocalizedCopy(language)('提示词', 'Prompt')}</h2>
                  <button type="button" disabled={selectedPreset.prompt === null} onClick={() => {
                    if (selectedPreset.prompt === null) return;
                    void navigator.clipboard.writeText(selectedPreset.prompt).then(() => setPromptCopied(true)).catch(() => setPromptCopied(false));
                  }}>
                    <Copy size={16} aria-hidden="true" />
                    {promptCopied ? (createLocalizedCopy(language)('已复制', 'Copied')) : (createLocalizedCopy(language)('复制 Prompt', 'Copy'))}
                  </button>
                </div>
                <p ref={promptRef} className={`${selectedPreset.prompt === null ? 'creator-template-detail-empty' : 'creator-template-prompt'}${promptExpanded ? ' is-expanded' : ''}`}>
                  {selectedPreset.prompt === null
                    ? (createLocalizedCopy(language)('此模板使用固定配置，无需预设提示词。', 'This template uses fixed settings and does not require a preset prompt.'))
                    : renderPromptVariables(selectedPreset.prompt, language)}
                </p>
                {promptHasOverflow || promptExpanded ? (
                  <button className="creator-template-prompt-expand" type="button" aria-expanded={promptExpanded} onClick={() => setPromptExpanded(value => !value)}>
                    {promptExpanded ? (createLocalizedCopy(language)('收起', 'Show less')) : (createLocalizedCopy(language)('查看全部', 'See all'))}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </section>

            <section className="creator-template-detail-section creator-template-specs-section">
              <button className="creator-template-specs-toggle" type="button" aria-expanded={detailsExpanded} onClick={() => setDetailsExpanded(value => !value)}>
                <Info size={16} aria-hidden="true" />
                <span>{createLocalizedCopy(language)('详情', 'Details')}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {detailsExpanded ? (
                <dl className="creator-template-specs">
                  {detailRows.map((detail, index) => (
                    <div key={`${detail.label}-${index}`}>
                      <dt>{detail.label}</dt>
                      <dd>
                        {detail.colors.length > 0 ? <span className="creator-template-swatches" aria-hidden="true">{detail.colors.map(color => <span key={color} style={{ backgroundColor: color }} />)}</span> : null}
                        {detail.text}
                      </dd>
                    </div>
                  ))}
                  {selectedPreset.requirements !== null ? (
                    <div><dt>{createLocalizedCopy(language)('运行需要', 'Requires')}</dt><dd>{selectedPreset.requirements.capabilities.join(', ')}</dd></div>
                  ) : null}
                </dl>
              ) : null}
            </section>

            {selectedPreset.tags.length > 0 ? (
              <section className="creator-template-detail-section creator-template-tags-section" aria-label={createLocalizedCopy(language)('标签', 'Tags')}>
                <h2><Tags size={16} aria-hidden="true" />{createLocalizedCopy(language)('标签', 'Tags')}</h2>
                <ul className="creator-template-tags" aria-label={createLocalizedCopy(language)('模板标签', 'Template tags')}>
                  {selectedPreset.tags.map(tag => <li key={tag}>{tag}</li>)}
                </ul>
              </section>
            ) : null}

            <IssueList
              issues={pageIssues.issues}
              actions={{ retryOperations: {
                'creator-launch.load-presets': () => props.onRetry?.(),
                'creator-launch.select-preset': () => selectPreset(selectedPreset)
              } }}
              onDismiss={pageIssues.dismissIssue}
              compact
            />

            <div className="creator-template-detail-footer">
              <button className="creator-template-use-button" type="button" disabled={busy} aria-busy={busy} onClick={() => void selectPreset(selectedPreset)}>
                <WandSparkles size={18} aria-hidden="true" />
                {busy ? (createLocalizedCopy(language)('正在创建...', 'Creating...')) : (createLocalizedCopy(language)('使用此模板', 'Use this template'))}
              </button>
            </div>

          </aside>
        </div>
        </div>
        </div>
        {!previewOpen ? null : createPortal(
          <div
            className="creator-template-preview-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePreview();
            }}
          >
            <section
              className="creator-template-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={createLocalizedCopy(language)(`${selectedPreset.title}完整作品`, `${selectedPreset.title} full result`)}
            >
              {selectedPreset.previewVideoUrl === undefined ? (
                <img src={previewUrl} alt={selectedPreset.title} />
              ) : (
                <video
                  src={selectedPreset.previewVideoUrl}
                  poster={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  autoPlay
                  loop
                  aria-label={createLocalizedCopy(language)(`${selectedPreset.title}完整示例视频`, `${selectedPreset.title} full example video`)}
                />
              )}
              <button
                ref={previewCloseRef}
                type="button"
                aria-label={createLocalizedCopy(language)('关闭预览', 'Close preview')}
                title={createLocalizedCopy(language)('关闭预览', 'Close preview')}
                onClick={closePreview}
              >
                <X size={19} aria-hidden="true" />
              </button>
            </section>
          </div>,
          document.body
        )}
      </>
    );
  })();

  return (
    <>
    <div className="creator-dashboard">
      <div
        className="creator-template-tabs"
        role="tablist"
        aria-label={createLocalizedCopy(language)('创作模板分类', 'Creation template categories')}
      >
        {categoryOrder.map(item => (
          <button
            type="button"
            role="tab"
            key={item}
            aria-selected={category === item}
            aria-controls="creator-template-panel"
            onClick={() => selectCategory(item)}
          >
            {categoryLabel(item, language)}
          </button>
        ))}
      </div>

      <section
        id="creator-template-panel"
        className="creator-dashboard-section"
        role="tabpanel"
        aria-labelledby="creator-templates-title"
      >
        <div className="creator-dashboard-heading">
          <h1 id="creator-templates-title">
            {createLocalizedCopy(language)('精选模板', 'Featured Templates')}
          </h1>
          {searchOpen ? (
            <div className="creator-template-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Escape') return;
                  setQuery('');
                  setSearchOpen(false);
                }}
                aria-label={createLocalizedCopy(language)('搜索模板', 'Search templates')}
                placeholder={createLocalizedCopy(language)('搜索模板', 'Search templates')}
              />
              <button
                type="button"
                aria-label={createLocalizedCopy(language)('关闭模板搜索', 'Close template search')}
                title={createLocalizedCopy(language)('关闭搜索', 'Close search')}
                onClick={() => {
                  setQuery('');
                  setSearchOpen(false);
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              className="creator-template-search-trigger"
              type="button"
              aria-label={createLocalizedCopy(language)('搜索模板', 'Search templates')}
              title={createLocalizedCopy(language)('搜索模板', 'Search templates')}
              onClick={() => {
                setSearchOpen(true);
                window.requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
            >
              <Search size={17} aria-hidden="true" />
            </button>
          )}
        </div>

        {(category === 'video' || category === 'image') ? (
          <div className="creator-template-tags-filter" role="group" aria-label={createLocalizedCopy(language)('筛选模板', 'Filter templates')} ref={tagsFilterRef}>
            <div className="creator-template-tags-line">
              <button
                type="button"
                aria-pressed={selectedTag === undefined}
                onClick={() => {
                  setSelectedTag(undefined);
                  setMoreTagsOpen(false);
                }}
              >
                {createLocalizedCopy(language)('全部', 'All')}
              </button>
              {visibleTagOptions.map(option => (
                <button
                  type="button"
                  key={option.id}
                  aria-pressed={selectedTag === option.id}
                  onClick={() => setSelectedTag(option.id)}
                >
                  {createLocalizedCopy(language)(option.zh, option.en)}
                </button>
              ))}
              {overflowTagOptions.length > 0 ? (
                <button
                  className="creator-template-tags-more"
                  type="button"
                  ref={moreTagsButtonRef}
                  aria-expanded={moreTagsOpen}
                  aria-controls="creator-template-tags-overflow"
                  onClick={() => setMoreTagsOpen(open => !open)}
                >
                  {moreTagsOpen
                    ? (createLocalizedCopy(language)('收起', 'Show less'))
                    : (createLocalizedCopy(language)('更多', 'More'))}
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {moreTagsOpen && overflowTagOptions.length > 0 ? (
              <div className="creator-template-tags-overflow" id="creator-template-tags-overflow" role="group" aria-label={createLocalizedCopy(language)('更多模板分类', 'More template filters')}>
                {overflowTagOptions.map(option => (
                  <button
                    type="button"
                    key={option.id}
                    aria-pressed={selectedTag === option.id}
                    onClick={() => {
                      setSelectedTag(option.id);
                      setMoreTagsOpen(false);
                    }}
                  >
                    {createLocalizedCopy(language)(option.zh, option.en)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="creator-template-tags-measure" aria-hidden="true" ref={tagsMeasureRef}>
              <button type="button" tabIndex={-1}>{createLocalizedCopy(language)('全部', 'All')}</button>
              {orderedTagOptions.map(option => (
                <button type="button" tabIndex={-1} key={option.id} aria-pressed={selectedTag === option.id}>
                  {createLocalizedCopy(language)(option.zh, option.en)}
                </button>
              ))}
              <button type="button" tabIndex={-1} className="creator-template-tags-more">
                {createLocalizedCopy(language)('更多', 'More')}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <button type="button" tabIndex={-1} className="creator-template-tags-more">
                {createLocalizedCopy(language)('收起', 'Show less')}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {props.loading ? (
          <div
            className="creator-template-grid creator-template-loading-grid"
            role="status"
            aria-busy="true"
            aria-label={createLocalizedCopy(language)('正在加载模板', 'Loading templates')}
          >
            {[0, 1, 2, 3].map(item => (
              <span className="creator-template-skeleton" aria-hidden="true" key={item}>
                <span className="creator-template-skeleton-media" />
                <span className="creator-template-skeleton-copy">
                  <span />
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {selectedPreset === undefined ? <IssueList
          issues={pageIssues.issues}
          actions={{ retryOperations: {
            'creator-launch.load-presets': () => props.onRetry?.()
          } }}
          onDismiss={pageIssues.dismissIssue}
        /> : null}

        {!props.loading && !props.error ? (
          <div className="creator-template-grid">
            {visiblePresets.map(preset => {
              const identity = presetIdentity(preset);
              return (
                <button
                  className="creator-template-card"
                  type="button"
                  key={identity}
                  data-preset-id={identity}
                  onClick={event => {
                    detailTriggerRef.current = event.currentTarget;
                    setPreviewOpen(false);
                    setSelectedPresetIdentity(identity);
                  }}
                  aria-label={createLocalizedCopy(language)(`查看${preset.title}模板详情`, `View ${preset.title} template details`)}
                >
                  <span className="creator-template-media">
                    <img src={preset.coverUrl} alt="" loading="lazy" />
                    {videoModules.has(preset.module) ? (
                      <span className="creator-template-play-marker" aria-hidden="true">
                        <Play size={16} fill="currentColor" strokeWidth={0} />
                      </span>
                    ) : null}
                  </span>
                  <span className="creator-template-copy">
                    <strong>{preset.title}</strong>
                  </span>
                </button>
              );
            })}
            {visiblePresets.length === 0 ? (
              <p className="creator-template-empty">
                {normalizedQuery
                  ? (createLocalizedCopy(language)('没有匹配的模板。', 'No matching presets.'))
                  : selectedTag !== undefined
                    ? (createLocalizedCopy(language)('该标签暂时没有模板。', 'No templates for this tag yet.'))
                  : category === 'recent'
                    ? (createLocalizedCopy(language)('还没有使用过模板。', 'No recently used templates.'))
                    : (createLocalizedCopy(language)('该分类暂时没有模板。', 'No templates are available in this category yet.'))}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
    {detail === null ? null : createPortal(detail, document.body)}
    </>
  );
}

function presetIdentity(preset: CreatorPresetSummary): string {
  return `${preset.module}/${preset.id}/${preset.version}`;
}

function renderPromptVariables(
  prompt: string,
  language: AppLanguage
) {
  const variablePattern = /(@Image\d+|\[[^\]\n]{1,80}\]|\{(?!\s*["'])[^{}\n]{1,80}\})/g;
  const nonVariableLabels = new Set(['结束', 'end']);
  const isVariable = (part: string): boolean => {
    if (/^@Image\d+$/.test(part) || /^\{(?!\s*["'])[^{}\n]{1,80}\}$/.test(part)) {
      return true;
    }
    const bracketMatch = part.match(/^\[([^\]\n]{1,80})\]$/);
    if (bracketMatch === null) return false;
    const label = bracketMatch[1]?.trim() ?? '';
    if (nonVariableLabels.has(label.toLowerCase())) return false;
    if (/(?:强制执行|严格限制|strict (?:rules?|requirements?))/i.test(label)) return false;
    return !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(label);
  };
  return prompt.split(variablePattern).map((part, index) => (
    isVariable(part) ? (
      <mark
        className="creator-template-prompt-variable"
        title={createLocalizedCopy(language)('可替换变量', 'Replaceable variable')}
        key={`${index}-${part}`}
      >
        {part}
      </mark>
    ) : part
  ));
}

function categoryLabel(
  category: CreatorHomeCategory,
  language: AppLanguage
): string {
  const labels: Record<CreatorHomeCategory, { zh: string; en: string }> = {
    recent: { zh: '最近', en: 'Recent' },
    recommended: { zh: '推荐', en: 'Recommended' },
    all: { zh: '全部', en: 'All' },
    video: { zh: '视频创作', en: 'Video Creation' },
    image: { zh: '图像设计', en: 'Image Design' }
  };
  return createLocalizedCopy(language)(labels[category].zh, labels[category].en);
}

function matchesFacet(preset: CreatorPresetSummary, option: FacetOption): boolean {
  return option.modules?.includes(preset.module) === true
    || (preset.tagIds ?? preset.tags).some(tag => option.tags.includes(tag));
}

function fitTagCount(widths: number[], availableWidth: number, gap: number): number {
  if (widths.length < 2) return 0;
  const optionWidths = widths.slice(1, -1);
  const allWidth = widths[0]!;
  const fullWidth = allWidth + optionWidths.reduce((sum, width) => sum + width + gap, 0);
  if (fullWidth <= availableWidth) return optionWidths.length;

  let usedWidth = allWidth + widths[widths.length - 1]! + gap;
  let count = 0;
  for (const width of optionWidths) {
    if (usedWidth + width + gap > availableWidth) break;
    usedWidth += width + gap;
    count++;
  }
  return count;
}

function readRecentPresetIds(): string[] {
  try {
    const stored = window.localStorage.getItem(recentPresetStorageKey);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeRecentPresetIds(identities: string[]) {
  try {
    window.localStorage.setItem(recentPresetStorageKey, JSON.stringify(identities));
  } catch {
    // Recent templates are optional when browser storage is unavailable.
  }
}

import type { CreatorWorkspace } from '../dashboard/creator-workspace.js';

export type CreatorProjectType = {
  workspace: CreatorWorkspace;
  title: string;
  englishTitle: string;
  description: string;
  englishDescription: string;
};

export const creatorProjectTypes: readonly CreatorProjectType[] = [
  {
    workspace: 'video-translation',
    title: '视频翻译',
    englishTitle: 'Video Translation',
    description: '字幕、配音与口型同步',
    englishDescription: 'Subtitles, dubbing, and lip sync'
  },
  {
    workspace: 'video-download',
    title: '视频下载',
    englishTitle: 'Video Downloader',
    description: '支持 YouTube、Bilibili 等平台',
    englishDescription: 'Supports YouTube, Bilibili, and more'
  },
  {
    workspace: 'stickman-video',
    title: '火柴人动画',
    englishTitle: 'Stick Figure Animation',
    description: '角色、分镜与完整动画',
    englishDescription: 'Characters, storyboards, and animation'
  },
  {
    workspace: 'auto-clips',
    title: '视频切片',
    englishTitle: 'Video Clips',
    description: 'AI 识别长视频高光片段',
    englishDescription: 'Find highlights in long videos with AI'
  },
  {
    workspace: 'smart-dubbing',
    title: '智能配音',
    englishTitle: 'AI Dubbing',
    description: '自然音色与情绪表达',
    englishDescription: 'Natural voices with expressive delivery'
  },
  {
    workspace: 'wechat-article',
    title: '文章写作',
    englishTitle: 'Article Writer',
    description: '公众号、X 等平台文章',
    englishDescription: 'Articles for WeChat, X, and more'
  },
  {
    workspace: 'xiaohongshu-post',
    title: '小红书帖子',
    englishTitle: 'Xiaohongshu Posts',
    description: '从主题和素材生成完整帖子',
    englishDescription: 'Turn topics and material into posts'
  },
  {
    workspace: 'short-video-script',
    title: '短视频脚本',
    englishTitle: 'Short Video Script',
    description: '生成分段口播与画面建议',
    englishDescription: 'Generate narration and visual suggestions'
  },
  {
    workspace: 'cover-generator',
    title: '封面生成',
    englishTitle: 'Thumbnail Generator',
    description: '生成视频与内容封面',
    englishDescription: 'Create thumbnails for videos and content'
  },
  {
    workspace: 'image-generation',
    title: '图像生成',
    englishTitle: 'Image Generation',
    description: '生成创意图片与视觉素材',
    englishDescription: 'Generate images and visual assets'
  },
  {
    workspace: 'video-generation',
    title: '视频生成',
    englishTitle: 'Video Generation',
    description: '文字或参考图生成视频片段',
    englishDescription: 'Generate video from text or references'
  }
];

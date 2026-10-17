import type { ImageGenerationProvider } from './media-generation.js';

export type ImageModelOptions = {
  aspectRatios?: string[];
  resolutions?: string[];
  qualities?: string[];
};

const standardRatios = ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16'];
const geminiRatios = [...standardRatios, '21:9'];
const wideGeminiRatios = [...geminiRatios, '1:4', '4:1', '1:8', '8:1'];

/** Manual provider contracts. Official services must use their own catalog metadata.
 * Sources: ai.google.dev/gemini-api/docs/image-generation, openai/openai-openapi,
 * volcengine.com/docs/82379/1541523, app.klingai.com/global/dev/document-api.
 * Unknown model IDs deliberately receive no inferred controls.
 */
export function imageModelOptions(provider: ImageGenerationProvider, model = ''): ImageModelOptions {
  const id = model.trim().toLowerCase();
  if (provider === 'codex-native') return { aspectRatios: ['1:1', '3:2', '2:3'], qualities: ['low', 'medium', 'high'] };
  if (provider === 'gemini') {
    if (/^gemini-2\.5-flash-image/.test(id)) return { aspectRatios: geminiRatios };
    if (/^gemini-3(?:\.1)?-pro-image/.test(id)) return { aspectRatios: geminiRatios, resolutions: ['1K', '2K', '4K'] };
    if (/^gemini-3\.1-flash-lite-image/.test(id)) return { aspectRatios: geminiRatios };
    if (/^gemini-3\.1-flash-image/.test(id)) return { aspectRatios: wideGeminiRatios, resolutions: ['1K', '2K', '4K', '512'] };
    if (/^gemini-nano-banana-2\.1/.test(id)) return { aspectRatios: wideGeminiRatios, resolutions: ['1K', '2K', '4K'] };
  }
  if (provider === 'jimeng' && /seedream-4[-.]/.test(id)) {
    return { aspectRatios: [...standardRatios, '21:9'], resolutions: ['2K', '4K'] };
  }
  if (provider === 'kling' && /^kling-v(?:1|1-5|2|2-new|2-1)(?:$|-)/.test(id)) {
    return { aspectRatios: standardRatios.filter(ratio => ratio !== '4:5' && ratio !== '5:4') };
  }
  if (provider === 'openai') {
    const qualities = ['low', 'medium', 'high', ...(/^gpt-image-2\.5-(?:sunburst|flare)/.test(id) ? ['xhigh', 'max'] : []), 'auto'];
    if (/^gpt-image-2(?:$|[.-])/.test(id)) return { aspectRatios: standardRatios, resolutions: ['1K', '2K'], qualities };
    if (/^gpt-image-1(?:$|[.-])/.test(id) || id === 'chatgpt-image-latest') return { aspectRatios: ['1:1', '3:2', '2:3'], qualities };
  }
  return {};
}

export function imageSizeAspectRatio(size: string): string {
  return size === '1536x1024' ? '3:2' : size === '1024x1536' ? '2:3' : '1:1';
}

/** Converts controls into provider pixel dimensions; Gemini uses aspectRatio directly. */
export function imageModelPixelSize(provider: ImageGenerationProvider, ratio: string, resolution?: string): string {
  if ((provider === 'openai' && !resolution) || provider === 'codex-native') {
    return ratio === '3:2' ? '1536x1024' : ratio === '2:3' ? '1024x1536' : '1024x1024';
  }
  const [width = 1, height = 1] = ratio.split(':').map(Number);
  // Seedream 2K needs at least ~3.6 MP (4.5+); keep its 4K longest edge at 4096.
  const scale = provider === 'jimeng'
    ? resolution === '4K' ? 4096 / Math.max(width, height) : 2048 / Math.sqrt(width * height)
    : (resolution === '2K' ? 2048 : 1024) / Math.max(width, height);
  return `${Math.round(width * scale / 16) * 16}x${Math.round(height * scale / 16) * 16}`;
}

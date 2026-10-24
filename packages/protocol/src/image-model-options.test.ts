import { expect, it } from 'vitest';
import { gatewayModelCompatible, gatewayModelReady, type GatewayModel } from './gateway-account.js';
import { imageModelOptions, migrateOpenAiImageModel } from './image-model-options.js';

it.each(['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1-2025-04-15', 'openai/gpt-image-1', '88api/gpt-image-1', ' GPT-IMAGE-1 '])(
  'retires %s from manual controls and official model selection', id => {
    expect(imageModelOptions('openai', id)).toEqual({});
    const model: GatewayModel = { id, modality: 'image', capabilities: ['generate'], status: 'ready' };
    expect(gatewayModelCompatible(model)).toBe(false);
    expect(gatewayModelReady(model)).toBe(false);
    expect(migrateOpenAiImageModel(id)).toBe(id.includes('/') ? `${id.split('/')[0]}/gpt-image-2` : 'gpt-image-2');
  }
);

it.each(['gpt-image-2', 'gpt-image-1.5', 'custom-image', 'chatgpt-image-latest'])(
  'preserves the independently configured model %s', id => {
    expect(migrateOpenAiImageModel(id)).toBe(id);
    const model: GatewayModel = { id, modality: 'image', capabilities: ['generate'] };
    expect(gatewayModelCompatible(model)).toBe(true);
    expect(gatewayModelReady(model)).toBe(true);
  }
);

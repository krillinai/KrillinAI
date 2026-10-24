import { expect, it } from 'vitest';
import { gatewayTranslationFlashModel, type GatewayModel } from '../src/gateway-account.js';

const model = (id: string, name = id): GatewayModel => ({ id, name, modality: 'text', capabilities: ['chat', 'responses'] });

it.each(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'deepseek-v4-1-flash-261017', 'deepseek/deepseek-v4.1-flash'])('resolves %s through its catalog identity', name => {
  const flash = model('opaque-flash', name);
  expect(gatewayTranslationFlashModel([model('gpt-5.5'), flash])).toBe(flash);
});

it('prefers the recommended ready Flash and excludes Pro, retired, non-chat and unknown routes', () => {
  const recommended = { ...model('new-flash', 'deepseek-v4.1-flash'), recommended: true };
  const invalid: GatewayModel[] = [model('deepseek-v4-pro'), model('oc_unknown'),
    { ...model('deepseek-flash'), status: 'retired' },
    { ...model('deepseek-v4-flash'), capabilities: ['responses'] }];
  expect(gatewayTranslationFlashModel(invalid)).toBeUndefined();
  expect(gatewayTranslationFlashModel([...invalid, model('deepseek-flash'), recommended])).toBe(recommended);
});

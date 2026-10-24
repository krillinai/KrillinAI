import { createDefaultCreatorServicesConfig, type CreatorJson, type GatewayAccountState, type GatewayModel } from '@opencreator/protocol';
import { expect, it } from 'vitest';
import { createGatewayCreatorSource } from '../../src/gateway/creator-service-source.js';

it.each([
  ['video-translation', undefined, 'oc_flash'],
  ['video-translation', 'oc_other', 'oc_other'],
  ['image-generation', undefined, 'oc_other']
] as const)('resolves %s task text choice %s independently of the global model', async (templateId, textChoice, expected) => {
  const models: GatewayModel[] = [
    { id: 'oc_other', name: 'gpt-5.5', modality: 'text', capabilities: ['chat', 'responses'] },
    { id: 'oc_flash', name: 'deepseek-v4.1-flash', modality: 'text', capabilities: ['chat', 'responses'] }
  ];
  const state: GatewayAccountState = { source: 'gateway', transport: 'gateway', authState: 'signed_in', activationState: 'ready', activationError: null,
    account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: 'binding', models, selectedModels: { text: 'oc_other' } };
  const frozen = { source: 'gateway' as const, accountId: 'a', bindingVersion: 'binding', supplier: 'openrouter' as const,
    models: { text: 'oc_other' }, capabilities: { text: ['chat', 'responses'] } };
  const manual = createDefaultCreatorServicesConfig();
  const source = createGatewayCreatorSource({
    account: { peekState: () => state,
      modelCredentials: async () => ({ accountId: 'a', transport: 'gateway', modelKey: 'private-key', keyVersion: '1', bindingVersion: 'binding',
        baseUrl: 'https://gateway.example/v1', defaults: { text: 'oc_other' }, models }) },
    manual: { read: async () => manual, write: async value => value, reset: async () => manual },
    getLocalOrigin: () => 'http://127.0.0.1:39999', readJobBinding: () => frozen,
    readJobTemplateId: () => templateId,
    readJobState: (): Record<string, CreatorJson> => textChoice ? { officialModels: { text: textChoice } } : {}
  });
  try {
    const snapshot = source.snapshot(templateId);
    expect(snapshot.source === 'gateway' && snapshot.models.text).toBe(templateId === 'video-translation' ? 'oc_flash' : 'oc_other');
    // Both preflight and execution use this same scope.
    for (const stageId of ['preflight:job', 'subtitle']) {
      const config = await source.runForJob('job', stageId, () => source.store.read());
      expect(config.llm.model).toBe(expected);
    }
    expect((await source.store.read()).llm.model).toBe('oc_other');
    expect(state.selectedModels?.text).toBe('oc_other');
    expect(frozen.models.text).toBe('oc_other');
  } finally { await source.revoke(); }
});

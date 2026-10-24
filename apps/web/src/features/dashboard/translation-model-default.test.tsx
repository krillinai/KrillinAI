import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GatewayAccountState } from '@opencreator/protocol';
import { OfficialServicesContext, useOfficialServices } from './official-services.js';

const fixture = vi.hoisted(() => ({ templateId: 'video-translation', state: {} as Record<string, unknown>, updateDraft: vi.fn() }));
vi.mock('./creator-session-store.js', () => ({ useOptionalCreatorSession: () => {
  const [state, setState] = useState(fixture.state);
  return { state, updateDraft(patch: Record<string, unknown>) { fixture.updateDraft(patch); setState(current => ({ ...current, ...patch, officialModels: { ...(current.officialModels as object ?? {}), ...(patch.officialModels as object ?? {}) } })); },
    job: { id: 'draft', templateId: fixture.templateId, status: 'draft', stages: [] } };
} }));
beforeEach(() => { fixture.templateId = 'video-translation'; fixture.state = {}; fixture.updateDraft.mockReset(); });

function mount() {
  const state: GatewayAccountState = { source: 'gateway', transport: 'gateway', authState: 'signed_in', activationState: 'ready', activationError: null,
    account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: 'binding', selectedModels: { text: 'oc_other', speech: 'speech' }, models: [
      { id: 'oc_other', name: 'gpt-5.5', modality: 'text', capabilities: ['chat', 'responses'] },
      { id: 'oc_flash', name: 'deepseek-v4.1-flash', modality: 'text', capabilities: ['chat', 'responses'] },
      { id: 'speech', modality: 'speech', capabilities: [] }
    ] };
  function Field() {
    const service = useOfficialServices('text');
    useOfficialServices('speech');
    return <><output aria-label="Selected model">{service.model?.id}</output><button onClick={() => service.selectModel('oc_other')}>Choose GPT</button></>;
  }
  render(<OfficialServicesContext.Provider value={state}><Field /></OfficialServicesContext.Provider>);
  return state;
}

it('defaults a new translation to Flash and preserves a subsequent manual choice', async () => {
  const account = mount();
  expect(screen.getByLabelText('Selected model')).toHaveTextContent('oc_flash');
  await waitFor(() => expect(fixture.updateDraft).toHaveBeenCalledWith(expect.objectContaining({ officialModels: expect.objectContaining({ text: 'oc_flash' }) })));
  fireEvent.click(screen.getByRole('button', { name: 'Choose GPT' }));
  expect(screen.getByLabelText('Selected model')).toHaveTextContent('oc_other');
  expect(account.selectedModels?.text).toBe('oc_other');
});

it('preserves an existing translation model selection', () => {
  fixture.state = { officialModels: { text: 'oc_other', speech: 'speech' } };
  mount();
  expect(screen.getByLabelText('Selected model')).toHaveTextContent('oc_other');
  expect(fixture.updateDraft).not.toHaveBeenCalled();
});

it('keeps other templates on the global text model', () => {
  fixture.templateId = 'short-video-script';
  mount();
  expect(screen.getByLabelText('Selected model')).toHaveTextContent('oc_other');
});

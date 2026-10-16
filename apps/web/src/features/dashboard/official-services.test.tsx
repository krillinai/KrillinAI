import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GatewayAccountState, GatewayModel } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { OfficialModelField, OfficialServicesContext, useOfficialServices } from './official-services.js';

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, updateDraft: vi.fn() }));
vi.mock('./creator-session-store.js', () => ({ useOptionalCreatorSession: () => {
  const [state, setState] = useState(fixture.state);
  return { state, updateDraft(patch: Record<string, unknown>) { fixture.updateDraft(patch); setState(current => ({ ...current, ...patch })); }, job: { id: 'draft', status: 'draft', stages: [] } };
} }));
beforeEach(() => { fixture.updateDraft.mockReset(); });

function mount(modality: GatewayModel['modality'], selected = 'vendor/first', transport?: GatewayAccountState['transport']) {
  fixture.state = { officialModels: { [modality]: selected } };
  fixture.updateDraft.mockImplementation(patch => { fixture.state = { ...fixture.state, ...patch }; });
  const state: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@test', verified: true }, bindingVersion: '1', activationError: null,
    transport, selectedModels: { [modality]: 'vendor/first' }, models: ['first', 'second'].map(name => ({ id: `vendor/${name}`, modality, capabilities: modality === 'transcription' ? ['subtitle_timestamps'] : ['responses','chat'] })) };
  function Field() {
    const service = useOfficialServices(modality);
    return <><OfficialModelField label="Model" service={service} /><button disabled={!service.ready}>Start</button></>;
  }
  return render(<LanguageProvider initialPreference="zh-CN"><OfficialServicesContext.Provider value={state}><Field /></OfficialServicesContext.Provider></LanguageProvider>);
}

it.each(['text', 'image', 'video', 'speech', 'transcription'] as const)('saves a catalog-compatible %s task model without inference', async modality => {
  mount(modality);
  fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
  fireEvent.click(screen.getByRole('option', { name: 'second' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('second'));
  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  expect(fixture.updateDraft).toHaveBeenCalledWith({ officialModels: { [modality]: 'vendor/second' } });
});

it('does not change an existing choice during initial model display', () => {
  mount('text');
  expect(fixture.updateDraft).not.toHaveBeenCalled();
});

it('keeps a removed task choice visible and lets the user replace it without silently changing the draft', async () => {
  mount('text', 'removed-model', 'gateway');
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('removed-model');
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  expect(fixture.updateDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
  fireEvent.click(screen.getByRole('option', { name: 'second' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
});

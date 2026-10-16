import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayAccountState } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { OfficialServicesContext } from './official-services.js';
import SmartDubbingWorkspace from './SmartDubbingWorkspace.js';

afterEach(cleanup);

it.each([false, true])('opens speech style and speed only when the selected official model supports them (%s)', supported => {
  const state: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@test', verified: true },
    bindingVersion: '1', activationError: null, models: [{ id: 'gemini-3.1-tts', modality: 'speech', voices: ['Kore'], capabilities: supported ? ['speech_instructions', 'speech_speed'] : [] }] };
  render(<LanguageProvider initialPreference="zh-CN"><OfficialServicesContext.Provider value={state}><SmartDubbingWorkspace onBack={vi.fn()} /></OfficialServicesContext.Provider></LanguageProvider>);
  fireEvent.change(screen.getByRole('textbox', { name: '配音文案内容' }), { target: { value: 'hello' } });
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  expect(screen.queryByRole('radiogroup', { name: '表达风格' }) !== null).toBe(supported);
  expect(screen.queryByRole('slider') !== null).toBe(supported);
});

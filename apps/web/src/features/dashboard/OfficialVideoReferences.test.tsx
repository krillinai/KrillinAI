import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GatewayModel, VideoGenerationReference } from '@opencreator/protocol';
import { beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import OfficialVideoReferences, { readVideoReferences, videoReferenceIssue } from './OfficialVideoReferences.js';

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown>, updateDraft: vi.fn(), uploadVideoReference: vi.fn(), captureCreatorFailure: vi.fn() }));
vi.mock('./creator-session-store.js', () => ({ useOptionalCreatorSession: () => mock }));
const assetId = `ocasset_${'a'.repeat(48)}`;
const image: VideoGenerationReference = { role: 'image', assetId, fileName: 'reference.png' };
const frame: VideoGenerationReference = { ...image, role: 'firstFrame' };
function model(profile = 'google', firstLastFrames = true): GatewayModel {
  return { id: 'video-test', modality: 'video', capabilities: ['generate'], videoOptions: { profile, maxImages: 3, maxVideos: 0, maxAudios: 0, firstLastFrames, framesExclusive: false, generateAudio: true, referenceDuration: 8 } };
}
beforeEach(() => { vi.clearAllMocks(); mock.state = {}; mock.uploadVideoReference.mockResolvedValue({ assetId, expiresAt: '2030-01-01T00:00:00Z' }); });
function view(m: GatewayModel, references: VideoGenerationReference[] = []) {
  const onError = vi.fn(); const onBusyChange = vi.fn();
  render(<LanguageProvider initialPreference="zh-CN"><OfficialVideoReferences model={m} references={references} disabled={false} onError={onError} onBusyChange={onBusyChange} /></LanguageProvider>);
  return { onError, onBusyChange };
}

it('validates mixed modes and model-specific reference limits', () => {
  expect(videoReferenceIssue(model(), [image, frame])).toBe('mixed');
  expect(videoReferenceIssue(model('wan'), [image, frame])).toBe('mixed');
  expect(videoReferenceIssue(model(), [{ ...frame, role: 'lastFrame' }])).toBe('frames');
  expect(videoReferenceIssue(model(), [frame, frame])).toBe('limits');
  expect(videoReferenceIssue(model('grok', false), [frame])).toBe('limits');
  expect(readVideoReferences([image, { ...image, assetId: 'https://private.example/image' }, null])).toEqual([image]);
});

it('allows recovery after switching to a model without first/last-frame support', () => {
  mock.state = { videoReferenceMode: 'frames' };
  view(model('grok', false), [frame]);
  expect(screen.getByRole('button', { name: '首尾帧' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '参考素材' }));
  expect(mock.updateDraft).toHaveBeenCalledWith({ videoReferenceMode: 'references', videoReferences: [] }, { semantic: true });
  expect(screen.getByRole('button', { name: '移除 reference.png' })).toBeEnabled();
});

it('uploads image bytes through the service and saves only the opaque reference', async () => {
  const { onBusyChange } = view(model());
  fireEvent.change(screen.getByLabelText('上传参考图片'), { target: { files: [new File(['png'], 'reference.png', { type: 'image/png' })] } });
  await waitFor(() => expect(mock.updateDraft).toHaveBeenCalledWith({ videoReferences: [image] }, { semantic: true }));
  expect(mock.uploadVideoReference).toHaveBeenCalledTimes(1);
  expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
});

it('rejects unsupported formats before uploading', () => {
  const { onError } = view(model());
  fireEvent.change(screen.getByLabelText('上传参考图片'), { target: { files: [new File(['text'], 'bad.txt', { type: 'text/plain' })] } });
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('文件格式不支持'));
  expect(mock.uploadVideoReference).not.toHaveBeenCalled();
});

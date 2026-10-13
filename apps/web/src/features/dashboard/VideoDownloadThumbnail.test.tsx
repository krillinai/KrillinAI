import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import VideoDownloadThumbnail from './VideoDownloadThumbnail.js';

const createObjectURL = vi.fn(() => 'blob:local-thumbnail');
const revokeObjectURL = vi.fn();
const source = 'http://sns-webpic-qc.xhscdn.com/signed-cover.jpg';
beforeEach(() => {
  createObjectURL.mockClear(); revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

it('recovers a rejected CDN image through the local transport and releases its URL', async () => {
  const load = vi.fn(async () => new Response('image', { headers: { 'content-type': 'image/jpeg' } }));
  const view = render(<VideoDownloadThumbnail src={source} alt="Cover" load={load} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', source);
  expect(load).not.toHaveBeenCalled();
  fireEvent.error(screen.getByRole('img'));
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local-thumbnail'));
  expect(load).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-thumbnail');
});

it.each([502, 200])('shows a placeholder if recovery returns an error or invalid image (%s)', async status => {
  const load = vi.fn(async () => new Response('error', { status, headers: { 'content-type': 'text/html' } }));
  render(<VideoDownloadThumbnail src={source} alt="Cover" load={load} />);
  fireEvent.error(screen.getByRole('img'));
  await waitFor(() => expect(screen.getByRole('img')).toHaveClass('video-download-image-placeholder'));
  expect(screen.getByRole('img').tagName).toBe('SPAN');
  expect(load).toHaveBeenCalledTimes(1);
  expect(createObjectURL).not.toHaveBeenCalled();
});

it('does not replace a newer source with an old recovery result', async () => {
  let finish!: (response: Response) => void;
  const load = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  const view = render(<VideoDownloadThumbnail src={source} alt="Cover" load={load} />);
  fireEvent.error(screen.getByRole('img'));
  view.rerender(<VideoDownloadThumbnail src="https://example.com/new.jpg" alt="New cover" load={load} />);
  await act(async () => finish(new Response('old image', { headers: { 'content-type': 'image/jpeg' } })));
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/new.jpg');
  expect(createObjectURL).not.toHaveBeenCalled();
});

it('does not create an object URL if unmounted during recovery', async () => {
  let finish!: (response: Response) => void;
  const view = render(<VideoDownloadThumbnail src={source} alt="Cover" load={() => new Promise<Response>(resolve => { finish = resolve; })} />);
  fireEvent.error(screen.getByRole('img'));
  view.unmount();
  await act(async () => finish(new Response('image', { headers: { 'content-type': 'image/jpeg' } })));
  expect(createObjectURL).not.toHaveBeenCalled();
});

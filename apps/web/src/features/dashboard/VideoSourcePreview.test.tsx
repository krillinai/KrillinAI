import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import VideoSourcePreview from './VideoSourcePreview.js';

const createObjectURL = vi.fn(() => 'blob:local-preview');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VideoSourcePreview', () => {
  it('offers download when an online video never loads and clears the timeout after playback is ready', async () => {
    vi.useFakeTimers();
    const onPrepare = vi.fn();
    const getVideoMetadata = vi.fn(async () => ({ platform: 'douyin' as const, title: 'Slow source', previewUrl: 'https://media.example.com/slow.mp4' }));
    const view = render(<VideoSourcePreview file={null} sourceType="url" url="https://v.douyin.com/example/" onChooseFile={vi.fn()} onClear={vi.fn()}
      metadataService={{ getVideoMetadata }} playbackPreview={{ pending: false, onPrepare }} />);
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(screen.getByLabelText('在线视频预览')).toBeVisible();
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByRole('button', { name: '下载并预览' })).toBeEnabled();
      expect(onPrepare).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '重试在线播放' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      fireEvent.loadedData(screen.getByLabelText('在线视频预览'));
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByLabelText('在线视频预览')).toBeVisible();
      expect(screen.queryByRole('button', { name: '下载并预览' })).not.toBeInTheDocument();
    } finally { view.unmount(); vi.useRealTimers(); }
  });
  it('previews a Douyin URL online first and exposes download only after playback fails', async () => {
    const onPrepare = vi.fn();
    const getVideoMetadata = vi.fn(async () => ({ platform: 'douyin' as const, title: 'Douyin video', previewUrl: 'https://media.example.com/online.mp4', thumbnailUrl: 'https://media.example.com/cover.jpg' }));
    render(<VideoSourcePreview file={null} sourceType="url" url="https://v.douyin.com/example/" onChooseFile={vi.fn()} onClear={vi.fn()}
      metadataService={{ getVideoMetadata }} playbackPreview={{ pending: false, onPrepare }} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在获取视频预览');
    expect(screen.queryByRole('button', { name: '下载并预览' })).not.toBeInTheDocument();
    const video = await screen.findByLabelText('在线视频预览');
    expect(video).toHaveAttribute('src', 'https://media.example.com/online.mp4');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(onPrepare).not.toHaveBeenCalled();
    fireEvent.error(video);
    expect(screen.getByText('在线播放暂不可用')).toBeVisible();
    expect(screen.getByRole('button', { name: '下载并预览' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '重试在线播放' }));
    expect(screen.queryByRole('button', { name: '下载并预览' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('在线视频预览')).toBeVisible();
    expect(getVideoMetadata).toHaveBeenCalledTimes(2);
    expect(onPrepare).not.toHaveBeenCalled();
  });

  it('falls back to an explicit download action when online resolution fails', async () => {
    const onPrepare = vi.fn();
    render(<VideoSourcePreview file={null} sourceType="url" url="https://v.douyin.com/example/" onChooseFile={vi.fn()} onClear={vi.fn()}
      metadataService={{ getVideoMetadata: vi.fn(async () => { throw new Error('Login required'); }) }} playbackPreview={{ pending: false, onPrepare }} />);
    expect(await screen.findByRole('button', { name: '下载并预览' })).toBeEnabled();
    expect(onPrepare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '下载并预览' }));
    expect(onPrepare).toHaveBeenCalledOnce();
  });

  it('ignores an old online response after switching the source URL', async () => {
    let resolveOld!: (value: { platform: 'douyin'; title: string; previewUrl: string }) => void;
    const getVideoMetadata = vi.fn((url: string) => url.includes('first')
      ? new Promise<{ platform: 'douyin'; title: string; previewUrl: string }>(resolve => { resolveOld = resolve; })
      : Promise.resolve({ platform: 'douyin' as const, title: 'Second video', previewUrl: 'https://media.example.com/second.mp4' }));
    const base = { file: null, sourceType: 'url' as const, onChooseFile: vi.fn(), onClear: vi.fn(), metadataService: { getVideoMetadata } };
    const view = render(<VideoSourcePreview {...base} url="https://v.douyin.com/first/" />);
    await waitFor(() => expect(getVideoMetadata).toHaveBeenCalledOnce());
    view.rerender(<VideoSourcePreview {...base} url="https://v.douyin.com/second/" />);
    expect(await screen.findByLabelText('在线视频预览')).toHaveAttribute('src', 'https://media.example.com/second.mp4');
    resolveOld({ platform: 'douyin', title: 'First video', previewUrl: 'https://media.example.com/first.mp4' });
    await waitFor(() => expect(screen.getByLabelText('在线视频预览')).toHaveAttribute('src', 'https://media.example.com/second.mp4'));
  });
  it('offers downloading for an external source, prevents duplicate requests, and plays the prepared file', () => {
    const onPrepare = vi.fn();
    const base = { file: null, sourceType: 'url' as const, url: 'https://v.douyin.com/example/', onChooseFile: vi.fn(), onClear: vi.fn() };
    const view = render(<VideoSourcePreview {...base} playbackPreview={{ pending: false, onPrepare }} />);
    fireEvent.click(screen.getByRole('button', { name: '下载并预览' }));
    expect(onPrepare).toHaveBeenCalledOnce();
    view.rerender(<VideoSourcePreview {...base} playbackPreview={{ pending: true, onPrepare }} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在准备视频预览');
    expect(screen.getByRole('button', { name: '正在准备…' })).toBeDisabled();
    view.rerender(<VideoSourcePreview {...base} playbackPreview={{ pending: false, error: '此视频需要登录', onPrepare }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('此视频需要登录');
    expect(screen.getByRole('button', { name: '重试视频预览' })).toBeEnabled();
    view.rerender(<VideoSourcePreview {...base} playbackPreview={{ pending: false, src: 'blob:downloaded' }} />);
    expect(screen.getByLabelText('原视频预览')).toHaveAttribute('src', 'blob:downloaded');
    expect(screen.queryByRole('button', { name: '下载并预览' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '在浏览器中打开原视频' })).toHaveAttribute('href', base.url);
  });
  it('previews a local file and releases its object URL', () => {
    const file = new File(['video'], 'local.mp4', { type: 'video/mp4' });
    const { unmount } = render(
      <VideoSourcePreview
        file={file}
        sourceType="file"
        url=""
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByLabelText('本地视频预览')).toHaveAttribute('src', 'blob:local-preview');
    expect(createObjectURL).toHaveBeenCalledWith(file);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });

  it('labels the English replacement action as Change', () => {
    render(
      <LanguageProvider initialPreference="en-US">
        <VideoSourcePreview
          file={new File(['video'], 'local.mp4', { type: 'video/mp4' })}
          sourceType="file"
          url=""
          onChooseFile={vi.fn()}
          onClear={vi.fn()}
        />
      </LanguageProvider>
    );

    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText('Choose another')).not.toBeInTheDocument();
  });

  it('restores an uploaded local source after the browser file is no longer available', () => {
    const onChooseFile = vi.fn();
    render(
      <LanguageProvider initialPreference="en-US">
        <VideoSourcePreview
          file={null}
          registeredFile={{
            name: 'restored.webm',
            size: 2 * 1024 * 1024,
            mime: 'video/webm'
          }}
          sourceType="file"
          url=""
          onChooseFile={onChooseFile}
          onClear={vi.fn()}
        />
      </LanguageProvider>
    );

    expect(screen.getByText('Local video uploaded')).toBeInTheDocument();
    expect(screen.getByText('restored.webm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onChooseFile).toHaveBeenCalledOnce();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('shows YouTube title information before loading the embedded player', async () => {
    const getVideoMetadata = vi.fn(async (url: string) => ({
      platform: 'youtube' as const,
      title: url.includes('preview-two') ? 'Second video title' : 'First video title',
      authorName: 'Example creator',
      thumbnailUrl: 'https://i.ytimg.com/vi/preview-one/hqdefault.jpg'
    }));
    const { rerender } = render(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://www.youtube.com/watch?v=preview-one"
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
        metadataService={{ getVideoMetadata }}
      />
    );

    expect(screen.getByRole('img', { name: 'YouTube 视频缩略图' })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/preview-one/hqdefault.jpg'
    );
    expect(screen.queryByTitle('YouTube 视频预览')).not.toBeInTheDocument();
    expect(await screen.findByText('First video title')).toBeInTheDocument();
    expect(screen.getByText('YouTube 视频 · Example creator')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '播放 YouTube 视频预览' }));
    expect(screen.getByTitle('YouTube 视频预览')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/preview-one'
    );

    rerender(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://youtu.be/preview-two?si=share-token"
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
        metadataService={{ getVideoMetadata }}
      />
    );
    expect(screen.getByRole('img', { name: 'YouTube 视频缩略图' })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/preview-two/hqdefault.jpg'
    );
    expect(await screen.findByText('Second video title')).toBeInTheDocument();
    expect(screen.queryByTitle('YouTube 视频预览')).not.toBeInTheDocument();
    expect(getVideoMetadata).toHaveBeenLastCalledWith('https://youtu.be/preview-two?si=share-token');
  });

  it('recognizes Bilibili and direct video links', () => {
    const { rerender } = render(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://www.bilibili.com/video/BV1xx411c7mD"
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByTitle('Bilibili 视频预览')).toHaveAttribute(
      'src',
      expect.stringContaining('bvid=BV1xx411c7mD')
    );

    rerender(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://cdn.example.com/demo.mp4?token=preview"
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByLabelText('视频链接预览')).toHaveAttribute(
      'src',
      'https://cdn.example.com/demo.mp4?token=preview'
    );
  });

  it('previews the selected Bilibili part instead of always P1', () => {
    render(<VideoSourcePreview file={null} sourceType="url"
      url="https://www.bilibili.com/video/BV18E421w7bf/?spm_id_from=share&p=3"
      onChooseFile={vi.fn()} onClear={vi.fn()} />);
    const player = new URL(screen.getByTitle('Bilibili 视频预览').getAttribute('src')!);
    expect(player.searchParams.get('p')).toBe('3');
    expect(player.searchParams.has('page')).toBe(false);
  });

  it('does not show a misleading P1 preview when a multipart source needs a selection', () => {
    render(<VideoSourcePreview file={null} sourceType="url"
      url="https://www.bilibili.com/video/BV18E421w7bf" onChooseFile={vi.fn()} onClear={vi.fn()}
      metadata={{ platform: 'bilibili', title: '课程', parts: [{ index: 1, title: '第一课' }, { index: 2, title: '第二课' }] }} />);
    expect(screen.queryByTitle('Bilibili 视频预览')).not.toBeInTheDocument();
    expect(screen.getByText('选择分集后预览视频')).toBeInTheDocument();
  });

  it('keeps the original platform link available when embedded playback fails', () => {
    render(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://www.youtube.com/watch?v=preview-test"
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: '在浏览器中打开原视频' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=preview-test'
    );
  });

  it('uses uploaded portrait video dimensions for the preview frame', () => {
    const onDimensions = vi.fn();
    render(
      <VideoSourcePreview
        file={new File(['video'], 'portrait.mp4', { type: 'video/mp4' })}
        sourceType="file"
        url=""
        onChooseFile={vi.fn()}
        onClear={vi.fn()}
        onDimensions={onDimensions}
      />
    );

    const video = screen.getByLabelText('本地视频预览');
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 }
    });
    fireEvent.loadedMetadata(video);

    expect(video).toHaveStyle({ aspectRatio: '1080 / 1920' });
    expect(video.closest('.video-source-preview-media')).toHaveStyle({ aspectRatio: '1080 / 1920' });
    expect(video.closest('.video-source-preview')).toHaveAttribute('data-orientation', 'portrait');
    expect(onDimensions).toHaveBeenCalledWith(1080, 1920);
  });

  it('shows a useful fallback without offering another source type', () => {
    const onChooseFile = vi.fn();
    const onClear = vi.fn();
    render(
      <VideoSourcePreview
        file={null}
        sourceType="url"
        url="https://video.example.com/watch/123"
        onChooseFile={onChooseFile}
        onClear={onClear}
      />
    );

    expect(screen.getByText('此平台暂不支持内嵌预览')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开原始链接' })).toHaveAttribute(
      'href',
      'https://video.example.com/watch/123'
    );
    expect(screen.queryByRole('button', { name: '改用本地视频' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除当前视频来源' }));
    expect(onChooseFile).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledOnce();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyRichContent } from './clipboard.js';

type ClipboardItemValue = Blob | Promise<Blob>;

class TestClipboardItem {
  constructor(readonly data: Record<string, ClipboardItemValue>) {}
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('copyRichContent', () => {
  it('copies styled HTML and plain text in one clipboard item', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText: vi.fn() }
    });
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    const root = document.createElement('article');
    root.innerHTML = '<h1 style="color: rgb(40, 91, 120)">标题</h1><p style="background-color: transparent; border: 0 none rgb(0, 0, 0)">正文</p><blockquote style="background-color: rgb(244, 248, 246); border-left: 4px solid rgb(47, 125, 104)">引用</blockquote><img src="data:image/png;base64,AA==" alt="配图">';
    document.body.append(root);

    await expect(copyRichContent(root, '# 标题\n\n正文')).resolves.toBe('rich');
    expect(write).toHaveBeenCalledTimes(1);
    const writeCalls = write.mock.calls as unknown as Array<[TestClipboardItem[]]>;
    const item = writeCalls[0]![0][0]!;
    expect(Object.keys(item.data)).toEqual(['text/html', 'text/plain']);
    const html = await readBlobText(await item.data['text/html']!);
    expect(html).toContain('OpenCreator rich article');
    expect(html).toContain('color: rgb(40, 91, 120)');
    expect(html).toContain('background-color: rgb(244, 248, 246)');
    expect(html).toContain('border-left: 4px solid rgb(47, 125, 104)');
    expect(html).not.toContain('background-color: transparent');
    expect(html).not.toContain('background-color: rgba(0, 0, 0, 0)');
    expect(html).toContain('data:image/png;base64,AA==');
    expect(html).not.toContain('alt="配图"');
    expect(html).toContain('width: 100%');
  });

  it('falls back to Markdown when rich clipboard access is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const root = document.createElement('article');
    root.textContent = '标题正文';

    await expect(copyRichContent(root, '# 标题\n\n正文')).resolves.toBe('plain');
    expect(writeText).toHaveBeenCalledWith('# 标题\n\n正文');
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

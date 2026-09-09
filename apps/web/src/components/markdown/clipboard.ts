export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type RichClipboardCopyResult = 'rich' | 'plain' | 'failed';

const richTextStyleProperties = [
  'border-radius',
  'box-sizing',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'list-style-position',
  'list-style-type',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'overflow-wrap',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-transform',
  'vertical-align',
  'white-space',
  'word-break'
] as const;

export async function copyRichContent(
  root: HTMLElement,
  fallbackText: string
): Promise<RichClipboardCopyResult> {
  const plainText = root.innerText?.trim() || root.textContent?.trim() || fallbackText;
  try {
    if (
      typeof navigator !== 'undefined'
      && navigator.clipboard?.write
      && typeof ClipboardItem !== 'undefined'
    ) {
      const html = serializeRichContent(root);
      const item = new ClipboardItem({
        'text/html': html.then(value => new Blob([value], { type: 'text/html' })),
        'text/plain': new Blob([plainText], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      return 'rich';
    }
  } catch {
    // Fall through to the plain-text clipboard for browsers that reject rich clipboard data.
  }
  return await copyToClipboard(fallbackText) ? 'plain' : 'failed';
}

async function serializeRichContent(root: HTMLElement): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement;
  const sourceElements = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const clonedElements = [clone, ...clone.querySelectorAll<HTMLElement>('*')];

  sourceElements.forEach((source, index) => {
    const target = clonedElements[index];
    if (target === undefined) return;
    const computed = window.getComputedStyle(source);
    target.removeAttribute('style');
    richTextStyleProperties.forEach(property => {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    });
    copyVisibleBackground(computed, target);
    copyVisibleBorders(computed, target);
    copyVisibleTextDecoration(computed, target);
  });

  await inlineCopiedImages(sourceElements, clonedElements);
  clone.querySelectorAll('button, script, style').forEach(element => element.remove());
  clone.style.setProperty('width', '100%');
  clone.style.setProperty('max-width', '100%');
  clone.style.setProperty('height', 'auto');
  clone.style.setProperty('margin', '0');
  clone.style.setProperty('box-shadow', 'none');

  clone.querySelectorAll<HTMLImageElement>('img').forEach(image => {
    image.removeAttribute('srcset');
    image.removeAttribute('alt');
    image.removeAttribute('title');
    image.style.setProperty('display', 'block');
    image.style.setProperty('width', '100%');
    image.style.setProperty('max-width', '100%');
    image.style.setProperty('height', 'auto');
    image.style.setProperty('object-fit', 'contain');
  });

  return `<!-- OpenCreator rich article -->${clone.outerHTML}`;
}

function copyVisibleBackground(computed: CSSStyleDeclaration, target: HTMLElement): void {
  const color = computed.getPropertyValue('background-color');
  if (!isTransparentColor(color)) target.style.setProperty('background-color', color);
}

function copyVisibleBorders(computed: CSSStyleDeclaration, target: HTMLElement): void {
  (['top', 'right', 'bottom', 'left'] as const).forEach(side => {
    const style = computed.getPropertyValue(`border-${side}-style`);
    const width = computed.getPropertyValue(`border-${side}-width`);
    const color = computed.getPropertyValue(`border-${side}-color`);
    if (style === 'none' || style === 'hidden' || parseFloat(width) <= 0 || isTransparentColor(color)) return;
    target.style.setProperty(`border-${side}`, `${width} ${style} ${color}`);
  });
}

function copyVisibleTextDecoration(computed: CSSStyleDeclaration, target: HTMLElement): void {
  const line = computed.getPropertyValue('text-decoration-line');
  if (!line || line === 'none') return;
  target.style.setProperty('text-decoration-line', line);
  target.style.setProperty('text-decoration-color', computed.getPropertyValue('text-decoration-color'));
  target.style.setProperty('text-decoration-style', computed.getPropertyValue('text-decoration-style'));
  target.style.setProperty('text-decoration-thickness', computed.getPropertyValue('text-decoration-thickness'));
  target.style.setProperty('text-underline-offset', computed.getPropertyValue('text-underline-offset'));
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, '');
  return normalized === ''
    || normalized === 'transparent'
    || normalized === 'rgba(0,0,0,0)'
    || normalized.endsWith(',0)');
}

async function inlineCopiedImages(
  sourceElements: HTMLElement[],
  clonedElements: HTMLElement[]
): Promise<void> {
  await Promise.all(sourceElements.map(async (source, index) => {
    if (!(source instanceof HTMLImageElement)) return;
    const target = clonedElements[index];
    if (!(target instanceof HTMLImageElement)) return;
    const src = source.currentSrc || source.src;
    if (!src || src.startsWith('data:')) return;
    try {
      const response = await fetch(src);
      if (!response.ok) return;
      target.src = await blobToDataUrl(await response.blob());
    } catch {
      // Keep the original URL when an external image cannot be read because of CORS.
    }
  }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Unable to read image')));
    reader.readAsDataURL(blob);
  });
}

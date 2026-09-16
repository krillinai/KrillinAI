export type KrillinCliExecutionAttempt = {
  source?: string;
  options: Record<string, unknown>;
  continueOnErrorCode?: string;
};

export type KrillinCliExecutionSources = {
  sourceUrl?: string;
  mediaSource?: string;
};

export function createKrillinCliExecutionPlan(
  stageId: string,
  sourcesOrOptions: KrillinCliExecutionSources | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>
): KrillinCliExecutionAttempt[] {
  const sources = maybeOptions === undefined ? {} : sourcesOrOptions as KrillinCliExecutionSources;
  const options = maybeOptions ?? sourcesOrOptions as Record<string, unknown>;
  if (maybeOptions === undefined) {
    return [{
      options: stageId === 'subtitle' && stringOption(options, 'captionSource') === undefined
        ? { ...options, captionSource: 'any' }
        : options
    }];
  }
  if (stageId !== 'subtitle') {
    return [{ options }];
  }

  const captionSource = stringOption(options, 'captionSource') ?? 'any';
  const mediaSource = sources.mediaSource ?? sources.sourceUrl;
  if (!isYouTubeSource(sources.sourceUrl) || captionSource === 'whisper') {
    return [{ ...(mediaSource === undefined ? {} : { source: mediaSource }), options }];
  }
  if (captionSource !== 'any') {
    return [{
      ...(sources.sourceUrl === undefined ? {} : { source: sources.sourceUrl }),
      options
    }];
  }

  return [
    {
      source: sources.sourceUrl,
      options: { ...options, captionSource: 'platform' },
      continueOnErrorCode: 'platform_caption_failed'
    },
    {
      ...(mediaSource === undefined ? {} : { source: mediaSource }),
      options: { ...options, captionSource: 'whisper' }
    }
  ];
}

export function isYouTubeSource(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return hostname === 'youtu.be'
      || hostname === 'youtube.com'
      || hostname.endsWith('.youtube.com')
      || hostname === 'youtube-nocookie.com'
      || hostname.endsWith('.youtube-nocookie.com');
  } catch {
    return false;
  }
}

function stringOption(options: Record<string, unknown>, name: string): string | undefined {
  const value = options[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

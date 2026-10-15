import { gatewayVideoSizeParameters, type GatewayModel } from '@opencreator/protocol';
import { GatewayError } from './client.js';
import { publicMediaReference, type MediaUploader } from './supplier-media.js';

export async function eightyEightVideoRequest(value: Record<string, unknown>, model: GatewayModel | undefined, upload: MediaUploader) {
  const fail = () => { throw new GatewayError('capability_unsupported', 400); };
  const id = typeof value.model === 'string' ? value.model : ''; const lower = id.toLowerCase();
  const { size, image, images, seconds, metadata, ...body } = value;
  if (!id || model && model.id !== id || typeof body.prompt !== 'string') fail();
  if (size) {
    const parameters = model ? gatewayVideoSizeParameters(model, String(size)) : { size };
    if (!parameters) fail();
    Object.assign(body, parameters);
  }
  if (seconds !== undefined && body.duration !== undefined) fail();
  const duration = body.duration ?? (seconds !== undefined ? Number(seconds) : undefined);
  const automatic = duration === -1 && (lower.startsWith('wan') || lower.startsWith('doubao-'));
  if (duration !== undefined && (!Number.isInteger(duration) || !automatic && (Number(duration) < 1 || model?.durations?.length && !model.durations.includes(Number(duration))))) fail();
  if (duration !== undefined) body.duration = duration;
  const ratio = body.ratio ?? body.aspect_ratio;
  if (body.ratio && body.aspect_ratio && body.ratio !== body.aspect_ratio) fail();
  if (ratio && ratio !== 'adaptive' && model?.aspectRatios?.length && !model.aspectRatios.includes(String(ratio))) fail();
  if (ratio === 'adaptive' && !lower.startsWith('wan') && !lower.startsWith('doubao-')) fail();
  if (body.resolution && model?.resolutions?.length && !model.resolutions.includes(String(body.resolution).toLowerCase())) fail();
  delete body.aspect_ratio; delete body.ratio;
  if (ratio) body[lower.startsWith('grok-') ? 'aspect_ratio' : 'ratio'] = ratio;
  else if (lower.startsWith('sd2.5')) body.ratio = '16:9';
  const refs = images === undefined ? image === undefined ? [] : [image] : Array.isArray(images) ? [...images] : fail();
  if (image !== undefined && images !== undefined) fail();
  const meta = metadata === undefined ? {} : metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata as Record<string, unknown> } : fail();
  const newer = lower.includes('2.5') || lower.includes('2-5');
  const maxImages = lower.startsWith('grok-') ? 1 : lower.startsWith('veo-') ? 3 : lower.startsWith('gemini-omni') ? 10 : lower.startsWith('kling') || newer ? 30 : lower.startsWith('wan') ? 10 : 9;
  if (refs.length > maxImages || refs.length && model && !model.capabilities.includes('image_to_video')) fail();
  if (refs.length) body.images = await Promise.all(refs.map(ref => publicMediaReference(ref, upload)));
  for (const key of ['referenceVideos', 'referenceAudios']) {
    if (meta[key] !== undefined) {
      if (!Array.isArray(meta[key])) fail();
      meta[key] = await Promise.all((meta[key] as unknown[]).map(ref => publicMediaReference(ref, upload)));
    }
  }
  for (const key of ['firstFrame', 'lastFrame']) if (meta[key] !== undefined) meta[key] = await publicMediaReference(meta[key], upload);
  for (const key of ['first_frame', 'last_frame', 'input_reference']) if (body[key] !== undefined) body[key] = await publicMediaReference(body[key], upload);
  if (lower.startsWith('gemini-omni') && meta.referenceVideos !== undefined) {
    if (body.video || body.videos) fail();
    body.videos = meta.referenceVideos; delete meta.referenceVideos;
  }
  if (body.video !== undefined) body.video = await publicMediaReference(body.video, upload);
  if (body.videos !== undefined) {
    if (!Array.isArray(body.videos)) fail();
    body.videos = await Promise.all((body.videos as unknown[]).map(ref => publicMediaReference(ref, upload)));
  }
  if (lower.startsWith('grok-') && (Object.keys(meta).length || body.video || body.videos || body.generate_audio !== undefined || body.generateAudio !== undefined)) fail();
  if (lower.startsWith('veo-') && (refs.length === 3 || meta.video_mode === 'reference' || body.task === 'reference_to_video') && duration !== undefined && duration !== 8) fail();
  if ((lower.startsWith('veo-') || lower.startsWith('gemini-omni')) && meta.referenceAudios !== undefined) fail();
  if (body.task === 'extend' && (lower.startsWith('veo-') || lower.startsWith('gemini-omni'))) {
    if (duration !== undefined || ratio || size || lower.startsWith('veo-') && body.resolution !== undefined || !body.video) fail();
  }
  if (lower.startsWith('wan')) {
    const media = body.media === undefined ? [] : Array.isArray(body.media) ? [...body.media] : fail();
    if (refs.length) media.push(...(body.images as string[]).map(url => ({ type: 'first_frame', url })));
    delete body.images;
    for (const [key, type] of [['firstFrame', 'first_frame'], ['lastFrame', 'last_frame'], ['referenceVideos', 'reference_video'], ['referenceAudios', 'reference_audio']] as const) {
      if (meta[key]) for (const url of Array.isArray(meta[key]) ? meta[key] as unknown[] : [meta[key]]) media.push({ type, url });
      delete meta[key];
    }
    const counts: Record<string, number> = {};
    const limits: Record<string, number> = { first_frame: 1, last_frame: 1, reference_image: 10, reference_video: 5, reference_audio: 5 };
    body.media = await Promise.all(media.map(async item => {
      if (!item || typeof item !== 'object' || !(item.type in limits) || (counts[item.type] = (counts[item.type] ?? 0) + 1) > limits[item.type]!) fail();
      return { type: item.type, url: await publicMediaReference(item.url, upload) };
    }));
    if (counts.last_frame && !counts.first_frame || counts.first_frame && Object.keys(counts).some(t => t.startsWith('reference_'))) fail();
  } else if (body.media !== undefined) fail();
  if (Object.keys(meta).length) body.metadata = meta;
  return body;
}

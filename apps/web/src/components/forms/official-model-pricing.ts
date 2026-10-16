import type { GatewayModel } from '@opencreator/protocol';
import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { formatGatewayCreditAmount } from '../../features/account/billing-display.js';

const million = 1_000_000;
const positive = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Keep workload assumptions aligned with the website credit calculator.
const assumptions = { imageInput: 200, imageOutput: 2000, speechCharacters: 1000, speechCharactersPerMinute: 300 };

function videoRate(model: GatewayModel) {
  const rates = model.price?.videoUnitsPerSecond;
  const resolutions = model.resolutions?.filter(resolution => Number.isSafeInteger(rates?.[resolution]) && positive(rates?.[resolution])) ?? [];
  if (!resolutions.length) return undefined;
  const resolution = resolutions.includes('720p') ? '720p' : resolutions[0]!;
  return { resolution, credits: rates![resolution]! / million };
}

function modelEstimate(model: GatewayModel, l: LocalizeCopy) {
  const p = model.price;
  if (!p) return undefined;
  const estimate = (credits: number, unit: string, description: string) => ({ credits: Math.round(credits * million) / million, unit, description });
  switch (model.modality) {
    case 'image':
      if (p.billing === 'usage') {
        if (!positive(p.inputPerMillion) || !positive(p.outputPerMillion)) return undefined;
        return estimate((p.inputPerMillion * assumptions.imageInput + p.outputPerMillion * assumptions.imageOutput) / million,
          l('积分/张', 'credits / image'), l('每张图片按 200 个文本输入 tokens、2,000 个图像输出 tokens 估算，无参考图；实际按 tokens 结算。', 'Per image: 200 text input tokens and 2,000 image output tokens, without a reference image. Actual usage is billed by tokens.'));
      }
      return positive(p.perRequest) ? estimate(p.perRequest, l('积分/张', 'credits / image'), l('按一次纯文生图请求、生成一张图片估算，无参考图。', 'One text-to-image request producing one image, without a reference image.')) : undefined;
    case 'speech':
      if (p.inputPerMillion !== undefined || p.outputPerMillion !== undefined) return undefined;
      if (positive(p.perMinute)) {
        const characters = p.perMillionCharacters ?? 0;
        if (!Number.isFinite(characters) || characters < 0) return undefined;
        return estimate(p.perMinute + characters * assumptions.speechCharactersPerMinute / million,
          l('积分/分钟', 'credits / minute'), l(`按生成 60 秒音频${characters > 0 ? '、输入 300 个字符' : ''}估算；实际按模型计费单位结算。`, `Estimated for 60 seconds of generated audio${characters > 0 ? ' and 300 input characters' : ''}. Actual usage settles in the model's billing units.`));
      }
      return positive(p.perMillionCharacters) ? estimate(p.perMillionCharacters * assumptions.speechCharacters / million,
        l('积分/千字符', 'credits / 1,000 characters'), l('按 1,000 个输入字符估算，实际按字符数结算；音频时长取决于语言和语速。', 'Estimated for 1,000 input characters, billed by actual character count. Audio duration varies with language and speaking speed.')) : undefined;
    case 'transcription':
      if (p.inputPerMillion !== undefined || p.outputPerMillion !== undefined || !positive(p.perMinute)) return undefined;
      return estimate(p.perMinute, l('积分/分钟', 'credits / minute'), l('按 60 秒音频、一次转录估算；按实际音频秒数结算，不足一分钟按比例扣积分。', 'Estimated for 60 seconds of audio and one transcription pass. Actual audio seconds are billed proportionally, including partial minutes.'));
  }
}

export function officialModelPrice(model: GatewayModel, l: LocalizeCopy): string {
  if (!model.price) return '';
  const p = model.price;
  if (model.modality === 'text') {
    if (!positive(p.inputPerMillion) || !positive(p.outputPerMillion)) return l('价格暂不可用', 'Price unavailable');
    return l(`输入 ${formatGatewayCreditAmount(p.inputPerMillion)} / 输出 ${formatGatewayCreditAmount(p.outputPerMillion)} 积分/百万 token`, `Input ${formatGatewayCreditAmount(p.inputPerMillion)} / output ${formatGatewayCreditAmount(p.outputPerMillion)} credits/M tokens`);
  }
  if (model.modality === 'video') {
    const rate = videoRate(model);
    return rate ? l(`约 ${formatGatewayCreditAmount(rate.credits)} 积分/秒 · ${rate.resolution}`, `About ${formatGatewayCreditAmount(rate.credits)} credits/second · ${rate.resolution}`) : l('价格暂不可用', 'Price unavailable');
  }
  const estimate = modelEstimate(model, l);
  return estimate ? l(`约 ${formatGatewayCreditAmount(estimate.credits)} ${estimate.unit}`, `About ${formatGatewayCreditAmount(estimate.credits)} ${estimate.unit}`) : l('暂无法估算', 'Estimate unavailable');
}

export function officialModelPriceDescription(model: GatewayModel, l: LocalizeCopy): string {
  const description = model.modality === 'text'
    ? l('按上游实际输入、输出及适用的缓存 token 用量结算；长上下文和分时费率按请求适用规则计算。显示单价取整，扣费保留内部精度。', 'Billed by actual upstream input, output and applicable cache token usage, with context tiers and time-based rates applied per request. Displayed rates are rounded; settlement retains internal precision.')
    : model.modality === 'video'
      ? l('按所选分辨率的每秒费率乘以请求时长结算。显示单价取整，扣费保留内部精度。', 'Billed at the per-second rate for the selected resolution multiplied by the requested duration. Displayed rates are rounded; settlement retains internal precision.')
      : modelEstimate(model, l)?.description;
  return [description, officialModelTariff(model, l)].filter(Boolean).join('\n');
}

function officialModelTariff(model: GatewayModel, l: LocalizeCopy): string {
  const p = model.price;
  if (!p) return '';
  const amount = formatGatewayCreditAmount;
  if (model.modality === 'video') return (model.resolutions ?? []).filter(resolution => positive(p.videoUnitsPerSecond?.[resolution])).map(resolution => l(`${resolution}：约 ${amount(p.videoUnitsPerSecond![resolution]! / million)} 积分/秒`, `${resolution}: about ${amount(p.videoUnitsPerSecond![resolution]! / million)} credits/second`)).join('\n');
  if (positive(p.perRequest)) return l(`${amount(p.perRequest)} 积分/次`, `${amount(p.perRequest)} credits/request`);
  if (model.modality === 'image' && p.billing === 'usage') return l(`文本输入 ${amount(p.inputPerMillion)} / 图片输入 ${amount(p.imageInputPerMillion)} / 输出 ${amount(p.outputPerMillion)} 积分/百万 token`, `Text ${amount(p.inputPerMillion)} / image ${amount(p.imageInputPerMillion)} in / output ${amount(p.outputPerMillion)} credits/M tokens`);
  const components: string[] = [];
  if (model.modality === 'speech' || model.modality === 'transcription') {
    if (p.inputPerMillion !== undefined) components.push(model.modality === 'speech' ? l(`文本输入 ${amount(p.inputPerMillion)} 积分/百万 token`, `Text input ${amount(p.inputPerMillion)} credits/M tokens`) : l(`输入 ${amount(p.inputPerMillion)} 积分/百万 token`, `Input ${amount(p.inputPerMillion)} credits/M tokens`));
    if (p.outputPerMillion !== undefined) components.push(l(`输出 ${amount(p.outputPerMillion)} 积分/百万 token`, `Output ${amount(p.outputPerMillion)} credits/M tokens`));
    if (positive(p.perMinute)) components.push(l(`${amount(p.perMinute)} 积分/分钟`, `${amount(p.perMinute)} credits/min`));
    if (positive(p.perMillionCharacters)) components.push(l(`${amount(p.perMillionCharacters)} 积分/百万字符`, `${amount(p.perMillionCharacters)} credits/M characters`));
    return components.join(' + ');
  }
  if (p.inputPerMillion !== undefined && p.outputPerMillion !== undefined) components.push(l(`输入 ${amount(p.inputPerMillion)} / 输出 ${amount(p.outputPerMillion)} 积分/百万 token`, `${amount(p.inputPerMillion)} in / ${amount(p.outputPerMillion)} out credits/M tokens`));
  if (p.cachedInputPerMillion !== undefined) components.push(l(`缓存输入 ${amount(p.cachedInputPerMillion)}`, `${amount(p.cachedInputPerMillion)} cached input`));
  if (p.cacheWritePerMillion !== undefined) components.push(l(`缓存写入 ${amount(p.cacheWritePerMillion)}`, `${amount(p.cacheWritePerMillion)} cache write`));
  return components.join(' · ');
}

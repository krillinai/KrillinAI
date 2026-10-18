import { z } from 'zod';
const text = z.string().trim().min(1).max(160);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const entry = z
  .object({
    source: text,
    targetLanguage: z
      .string()
      .trim()
      .max(35)
      .regex(/^(?:\*|[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*)$/i),
    translation: z.string().trim().max(500),
    preserveOriginal: z.boolean(),
    note: z.string().max(1000)
  })
  .strict()
  .refine((e) => e.preserveOriginal || e.translation.length > 0);
export const personalAssetInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      name: text,
      kind: z.literal('dictionary'),
      data: z.object({ entries: z.array(entry).max(1000) }).strict()
    })
    .strict(),
  z
    .object({
      name: text,
      kind: z.literal('voice'),
      data: z
        .object({
          provider: z.enum([
            'edge-tts',
            'openai',
            'aliyun',
            'volcengine',
            'minimax'
          ]),
          model: z.string().trim().min(1).max(160),
          voiceId: text,
          language: z.string().trim().max(35)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      name: text,
      kind: z.literal('subtitle-style'),
      data: z
        .object({
          subtitleFont: z.enum(['system', 'sans', 'serif', 'rounded']),
          subtitleWeight: z.enum(['regular', 'medium', 'bold']),
          subtitleSize: z.enum(['small', 'medium', 'large']),
          subtitleColor: color,
          subtitleSecondaryColor: color,
          subtitleOutlineColor: color,
          subtitleOutlineWidth: z.number().min(0).max(12),
          subtitleShadowEnabled: z.boolean(),
          subtitleShadowColor: color,
          subtitleShadowOpacity: z.number().min(0).max(1),
          subtitleShadowOffsetX: z.number().min(-20).max(20),
          subtitleShadowOffsetY: z.number().min(-20).max(20),
          subtitleShadowBlur: z.number().min(0).max(30)
        })
        .strict()
    })
    .strict()
]);

export const dictionarySnapshotSchema =
  personalAssetInputSchema.options[0].extend({
    id: text,
    revision: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string()
  });
export const translationDictionariesSchema = z
  .array(dictionarySnapshotSchema)
  .max(20);

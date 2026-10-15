export const supplierBases = {
  openrouter: 'https://openrouter.ai/api/v1',
  '88api': 'https://api.88api.ai/v1',
  chatanywhere: 'https://api.chatanywhere.tech/v1'
} as const;

export const chatAnywhereOverseasBase = 'https://api.chatanywhere.org/v1';
export type SupplierRegion = 'auto' | 'domestic' | 'overseas';
export function isChatAnywhereBase(base: string): boolean {
  return base === supplierBases.chatanywhere || base === chatAnywhereOverseasBase;
}
export function isSupplierBase(supplier: string | undefined, base: string): boolean {
  return supplier === 'chatanywhere' ? isChatAnywhereBase(base)
    : supplier === '88api' ? base === supplierBases['88api']
    : supplier === 'openrouter' ? base === supplierBases.openrouter : false;
}

export function isDirectTransport(transport: string | undefined): boolean {
  return transport === 'openrouter-direct' || transport === 'supplier-direct';
}

export function isKnownDirectBase(baseUrl: string): boolean {
  return Object.values(supplierBases).some(base => base === baseUrl) || baseUrl === chatAnywhereOverseasBase;
}

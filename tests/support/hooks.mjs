// Lade-Hooks für Tests mit three.js-Modulen (node --test): „three“ → lokale Kopie in www/vendor,
// render/models.js wird für render/vehicleModel.js durch modelsSpy.mjs ersetzt (merkt sich jede Grundform).
const THREE_URL = new URL('../../www/vendor/three.module.js', import.meta.url).href;
const SPY_URL = new URL('./modelsSpy.mjs', import.meta.url).href;

export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: THREE_URL, shortCircuit: true };
  if (spec === './models.js' && ctx.parentURL && ctx.parentURL.endsWith('/render/vehicleModel.js')) return { url: SPY_URL, shortCircuit: true };
  return next(spec, ctx);
}

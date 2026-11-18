// Graphics settings: what the renderer spends its time on. Presets for
// quick choices, each option also on its own (then the preset reads
// 'custom'). Kept in this browser.

const KEY = 'marble-race-graphics';

// [value, label] per option, in the order the menus list them.
export const OPTIONS = {
  preset: [['low', 'Low (no dedicated GPU)'], ['medium', 'Medium'], ['high', 'High'], ['custom', 'Custom']],
  shadows: [['off', 'Off'], ['contact', 'Under marbles only'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']],
  resolution: [['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %']],
  marbles: [['low', 'Simple'], ['high', 'Detailed']],
  tone: [['off', 'Off (flat)'], ['aces', 'Filmic (ACES)'], ['agx', 'Natural (AgX)']],
  ao: [['off', 'Off'], ['low', 'Low'], ['high', 'High']],
  reflections: [['studio', 'Studio'], ['scene', 'Theme sky']],
};

export const PRESETS = {
  low: { shadows: 'contact', resolution: '0.75', antialias: false, marbles: 'low', tone: 'off', ao: 'off', reflections: 'studio', decorations: true, dust: false },
  medium: { shadows: 'low', resolution: '1', antialias: true, marbles: 'high', tone: 'aces', ao: 'off', reflections: 'scene', decorations: true, dust: true },
  high: { shadows: 'high', resolution: '1', antialias: true, marbles: 'high', tone: 'aces', ao: 'high', reflections: 'scene', decorations: true, dust: true },
};

// The preset these settings match, or 'custom'.
export function presetOf(s) {
  const keys = Object.keys(PRESETS.high);
  return Object.keys(PRESETS).find((p) => keys.every((k) => PRESETS[p][k] === s[k])) ?? 'custom';
}

// First visit: a guess from the GPU's name. Software rendering gets Low, a
// GPU built into the processor Medium, anything else High.
function guessPreset() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? '');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
    if (/intel|uhd|iris|mali|adreno|powervr|videocore/i.test(name)) return 'medium';
  } catch {
    // no guess: High
  }
  return 'high';
}

export function loadGraphics() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    // ignore: defaults
  }
  const base = PRESETS[saved ? 'high' : guessPreset()];
  const s = { ...base, fps: false, ...(saved ?? {}) };
  // Unknown values (older or edited storage) fall back to the preset's.
  for (const k of ['shadows', 'resolution', 'marbles', 'tone', 'ao', 'reflections']) {
    if (!OPTIONS[k].some(([v]) => v === s[k])) s[k] = base[k];
  }
  return s;
}

export function storeGraphics(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore: not kept
  }
}

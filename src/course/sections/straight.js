import { runTrack } from '../trackBuilder.js';

// Plain sloped connector. opts: { len, pitch, width, rail }
export function build(ctx, entry, opts = {}) {
  return runTrack(ctx, entry, [{ len: opts.len ?? 2, pitch: opts.pitch }], opts);
}

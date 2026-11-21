import { Vector3 } from 'three';

// Where the world's origin has moved to: the sum of every shift back towards
// (0, 0, 0) in endless mode (see course/endless.js). Shaders that colour by
// world position (rainbow by height, stripes, picture mosaic, ground grids)
// subtract it, so their patterns stay put on the track when everything is
// shifted. Zero on a fixed course.
export const WORLD_ORIGIN = { value: new Vector3() };

// GLSL declaration, for shader chunks that use it.
export const ORIGIN_UNIFORM = 'uniform vec3 uWorldOrigin;';

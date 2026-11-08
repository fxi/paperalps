precision highp float;
precision highp int;
precision highp sampler2D;
precision highp isampler2D;

// ---- DEM cascade: near ring at dz, far ring at dz-3 -----------------------
uniform sampler2D uHeights;   // near: R32F, kx*512 x ky*512
uniform isampler2D uStatus;   // near: tile id held by each slot
uniform ivec2 uK;
uniform ivec2 uCamInt;        // flyer, near data px (integer part)
uniform vec2 uCamFrac;
uniform float uNearReach;     // near ring guaranteed coverage around the flyer (data px)

uniform sampler2D uHeightsF;  // far ring
uniform isampler2D uStatusF;
uniform ivec2 uKF;
uniform ivec2 uCamIntF;       // flyer, far data px
uniform vec2 uCamFracF;

uniform float uMpp;     // metres per near data px
uniform float uExag;    // shading exaggeration
uniform vec3 uSun;      // direction to sun (x east, y south, z up)
uniform float uShadow;

bool gMiss = false;

float texelOf(sampler2D hs, isampler2D st, ivec2 k, ivec2 p, inout bool ok) {
  ivec2 t = ivec2(floor(vec2(p) / 512.0));
  ivec2 slot = ivec2(((t.x % k.x) + k.x) % k.x, ((t.y % k.y) + k.y) % k.y);
  if (texelFetch(st, slot, 0).xy != t) { ok = false; return 0.0; }
  return texelFetch(hs, slot * 512 + (p - t * 512), 0).r;
}

float bilinear(sampler2D hs, isampler2D st, ivec2 k, ivec2 ci, vec2 cf, vec2 rel, out bool ok) {
  ok = true;
  vec2 f = cf + rel - 0.5;
  vec2 fl = floor(f);
  vec2 t = f - fl;
  ivec2 p = ci + ivec2(fl);
  // fast path: all four texels in one tile -> a single status check
  ivec2 t0 = ivec2(floor(vec2(p) / 512.0));
  if (all(equal(t0, ivec2(floor(vec2(p + 1) / 512.0))))) {
    ivec2 slot = ivec2(((t0.x % k.x) + k.x) % k.x, ((t0.y % k.y) + k.y) % k.y);
    if (texelFetch(st, slot, 0).xy != t0) { ok = false; return 0.0; }
    ivec2 q = slot * 512 + (p - t0 * 512);
    float a0 = texelFetch(hs, q, 0).r;
    float b0 = texelFetch(hs, q + ivec2(1, 0), 0).r;
    float c0 = texelFetch(hs, q + ivec2(0, 1), 0).r;
    float d0 = texelFetch(hs, q + ivec2(1, 1), 0).r;
    return mix(mix(a0, b0, t.x), mix(c0, d0, t.x), t.y);
  }
  float a = texelOf(hs, st, k, p, ok);
  float b = texelOf(hs, st, k, p + ivec2(1, 0), ok);
  float c = texelOf(hs, st, k, p + ivec2(0, 1), ok);
  float d = texelOf(hs, st, k, p + ivec2(1, 1), ok);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

// Height (m) at an offset from the flyer, in near data px. Near (fine) data
// wins close by and cross-fades to the far (coarse) ring with distance. The
// blend depends only on the distance from the flyer, so it glides smoothly
// instead of jumping whenever the loaded ring shifts by a tile.
float H(vec2 rel) {
  float cheb = max(abs(rel.x), abs(rel.y));
  float wN = 1.0 - smoothstep(uNearReach * 0.7, uNearReach * 0.95, cheb);
  bool okN = false;
  bool okF = false;
  float hn = 0.0;
  float hf = 0.0;
  if (wN > 0.0) hn = bilinear(uHeights, uStatus, uK, uCamInt, uCamFrac, rel, okN);
  if (!okN) wN = 0.0;
  if (wN < 1.0) {
    hf = bilinear(uHeightsF, uStatusF, uKF, uCamIntF, uCamFracF, rel * 0.125, okF);
    if (!okF) {
      if (okN) wN = 1.0;
      else { gMiss = true; return 0.0; }
    }
  }
  return mix(hf, hn, wN);
}

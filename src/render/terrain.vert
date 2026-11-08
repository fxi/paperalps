// Nested square grids ("clipmap" levels). Each level is the same N x N grid
// with spacing s0 * 2^L, snapped to multiples of 2·spacing in world space, so
// every vertex sits on a fixed ground position and is never re-sampled while
// you fly.
//
// Seams: near a level's outer edge, odd vertices blend their *height* (not
// their position) towards the coarse surface, i.e. the average of the two
// even neighbours along the coarse triangle edge/diagonal they sit on. Every
// height sample stays at a fixed world point; only the blend weight changes,
// and at full blend the fine grid is coplanar with the coarse level that
// takes over: no cracks, no swimming.
in vec2 aGrid; // integer grid coordinates (0..N)

uniform mat4 uViewProj;
uniform vec2 uOrigin;     // grid (0,0) relative to the flyer, near data px
uniform float uSpacing;   // near data px
uniform vec2 uMorph;      // blend start/end (Chebyshev distance from flyer, data px)
uniform float uLift;      // geometric exaggeration
uniform float uAlt;       // flyer altitude (m)
uniform float uGnd;       // ground under flyer, fallback height

out vec2 vRel;
out float vDist;
out float vAO;

// Large-scale curvature AO at a fixed world footprint `fp` (data px). Smooth
// enough to interpolate across the grid. (Cast shadows are per pixel: per
// vertex they followed the grid cells and showed a staircase.)
float aoAt(vec2 rel, float h, float fp) {
  float r2 = max(28.0 * fp, 24.0);
  float hm = 0.25 * (H(rel + vec2(r2, 0.0)) + H(rel - vec2(r2, 0.0)) + H(rel + vec2(0.0, r2)) + H(rel - vec2(0.0, r2)));
  float curv = (hm - h) * uExag / (r2 * uMpp);
  return clamp(1.0 - curv * 1.1, 0.66, 1.06);
}

void main() {
  vec2 rel = uOrigin + aGrid * uSpacing;
  float d = max(abs(rel.x), abs(rel.y));
  float m = clamp((d - uMorph.x) / (uMorph.y - uMorph.x), 0.0, 1.0);

  float h = H(rel);
  vec2 odd = mod(aGrid, 2.0);
  if (m > 0.0 && odd.x + odd.y > 0.0) {
    // odd x: edge midpoint (±s,0); odd y: (0,±s); both: the a–d diagonal (±s,±s)
    vec2 off = odd * uSpacing;
    float hc = 0.5 * (H(rel - off) + H(rel + off));
    h = mix(h, hc, m);
  }
  if (gMiss) h = uGnd;

  vec3 P = vec3(rel.x * uMpp, -rel.y * uMpp, (h - uAlt) * uLift);
  vRel = rel;
  vDist = length(P);
  gl_Position = uViewProj * vec4(P, 1.0);

  // AO footprint tied to the level spacing (fixed in the world). In the
  // blend band, mix with the next level's result instead of sliding it.
  vAO = aoAt(rel, h, uSpacing);
  if (m > 0.0) vAO = mix(vAO, aoAt(rel, h, uSpacing * 2.0), m);
}

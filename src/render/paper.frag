// Paper / ink terrain shading. Prepended with common.glsl (DEM cascade, H()).

in vec2 vRel;   // data px from the flyer (interpolated ground position)
in float vDist; // metres from the eye
in float vAO;   // per-vertex large-scale AO

// ---- view ------------------------------------------------------------------
uniform vec2 uRes;            // framebuffer size
uniform float uCssPx;         // framebuffer px per CSS px
uniform float uSpacing;       // clipmap level spacing (data px), fixed in the world

// ---- facet octaves ------------------------------------------------------------
uniform ivec2 uOctBase[4];    // integer cell of the flyer per octave
uniform vec2 uOctFrac[4];     // fractional cell of the flyer per octave
uniform float uOctCell[4];    // cell size in data px per octave
uniform float uOctW[4];       // blend weight per octave (sum = 1)
uniform int uOctLevel[4];     // absolute level (hash salt)

// ---- art direction --------------------------------------------------------
uniform float uCrumple;
uniform float uFacet;
uniform float uFogAlt;        // valley mist altitude (m)
uniform float uFog;           // valley mist strength
uniform float uClouds;
uniform float uFogDist;       // horizon fog distance (m)
uniform vec3 uFogCol;         // horizon colour (matches the sky)
uniform float uInk;           // 0 = white paper, 1 = black paper + white paint
uniform float uNight;         // 0..1 night: dark land, lit by lamps
uniform int uLampN;
uniform vec4 uLamps[16];      // east, north (m from the flyer), radius (m), power
// Procedural noise domains (clouds, mist, fibre, fibre, brush). Domain i is
// evaluated at  uNoiseA[i] + rel * uZ8PerData * NOISE_K[i],  where the anchor
// is (flyer_z8 * k + drift) mod NOISE_P, computed in double precision on the
// CPU. The noise lattice is NOISE_P-periodic, so the wrap is invisible and
// coordinates stay small (no float jitter).
uniform vec2 uNoiseA[5];
const float NOISE_K[5] = float[5](0.045, 0.12, 2.6, 9.0, 0.6);
uniform float uZ8PerData;
uniform float uTime;
uniform float uFade;
uniform float uExpo;
uniform float uContrast;

out vec4 fragColor;

// ---------------------------------------------------------------------------
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
vec2 hash2(ivec2 c, int salt) {
  uint h = pcg(uint(c.x) ^ pcg(uint(c.y) ^ pcg(uint(salt))));
  uint h2 = pcg(h);
  return vec2(float(h & 0xffffu), float(h2 & 0xffffu)) / 65535.0;
}
float hash1(ivec2 c, int salt) { return hash2(c, salt + 77).x; }

// Value noise on a 4096-periodic lattice (matches NOISE_P on the CPU).
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  const int M = 4095;
  float a = hash1(ii & M, 3);
  float b = hash1((ii + ivec2(1, 0)) & M, 3);
  float c = hash1((ii + ivec2(0, 1)) & M, 3);
  float d = hash1((ii + ivec2(1, 1)) & M, 3);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Exact x2 octaves keep the sum periodic too.
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.0 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s;
}

// Dry-brush streaks along one of four fixed lattice directions. Integer
// rotation matrices and integer stretches keep the pattern periodic and the
// coordinates fixed in the world (nothing rotates with the terrain normal).
float streaks(vec2 q) {
  return vnoise(vec2(q.x, q.y * 12.0)) * 0.65 + vnoise(vec2(q.x * 3.0, q.y * 32.0)) * 0.35;
}
float brushAlong(vec2 p, vec2 along) {
  vec4 w = pow(abs(vec4(along.x, along.y, (along.x + along.y) * 0.7071, (along.x - along.y) * 0.7071)), vec4(6.0));
  w /= max(w.x + w.y + w.z + w.w, 1e-4);
  float b = 0.0;
  if (w.x > 0.01) b += w.x * streaks(vec2(p.x, p.y));
  if (w.y > 0.01) b += w.y * streaks(vec2(p.y, -p.x));
  if (w.z > 0.01) b += w.z * streaks(vec2(p.x + p.y, p.y - p.x));
  if (w.w > 0.01) b += w.w * streaks(vec2(p.x - p.y, p.x + p.y));
  return b;
}

vec2 noiseP(int i, vec2 rel) {
  return uNoiseA[i] + rel * (uZ8PerData * NOISE_K[i]);
}

// ---- facets ------------------------------------------------------------------
vec2 vtx(ivec2 base, ivec2 c, int lvl) {
  return vec2(c) + (hash2(base + c, lvl) - 0.5) * 0.62;
}

bool inTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 v0 = b - a, v1 = c - a, v2 = p - a;
  float d = v0.x * v1.y - v1.x * v0.y;
  float u = (v2.x * v1.y - v1.x * v2.y) / d;
  float v = (v0.x * v2.y - v2.x * v0.y) / d;
  return u >= -1e-4 && v >= -1e-4 && u + v <= 1.0001;
}

// Slope (dh/dx, dh/dy) of the facet under the fragment for octave o, plus
// .z = distance to the nearest facet edge in framebuffer px.
vec3 facet(int o, vec2 rel, float crumpleAmp, float pf) {
  vec2 local = uOctFrac[o] + rel / uOctCell[o];
  ivec2 cell = ivec2(floor(local));
  vec2 lp = local - vec2(cell);
  ivec2 base = uOctBase[o] + cell;
  int lvl = uOctLevel[o];

  vec2 A = vec2(0), B = vec2(0), C = vec2(0);
  ivec2 ia = ivec2(0), ib = ivec2(0), ic = ivec2(0);
  bool found = false;
  for (int k = 0; k < 9 && !found; k++) {
    int kk = k == 0 ? 4 : (k <= 4 ? k - 1 : k);
    ivec2 d = ivec2(kk % 3 - 1, kk / 3 - 1);
    ivec2 c00 = d, c10 = d + ivec2(1, 0), c01 = d + ivec2(0, 1), c11 = d + ivec2(1, 1);
    vec2 p00 = vtx(base, c00, lvl), p10 = vtx(base, c10, lvl);
    vec2 p01 = vtx(base, c01, lvl), p11 = vtx(base, c11, lvl);
    bool diag = hash1(base + d, lvl + 11) > 0.5;
    if (diag) {
      if (inTri(lp, p00, p10, p11)) { A = p00; B = p10; C = p11; ia = c00; ib = c10; ic = c11; found = true; }
      else if (inTri(lp, p00, p11, p01)) { A = p00; B = p11; C = p01; ia = c00; ib = c11; ic = c01; found = true; }
    } else {
      if (inTri(lp, p00, p10, p01)) { A = p00; B = p10; C = p01; ia = c00; ib = c10; ic = c01; found = true; }
      else if (inTri(lp, p10, p11, p01)) { A = p10; B = p11; C = p01; ia = c10; ib = c11; ic = c01; found = true; }
    }
  }
  if (!found) return vec3(0.0, 0.0, 99.0);

  float cellM = uOctCell[o] * uMpp;
  vec2 toRel = vec2(uOctCell[o]);
  float ha = H((vec2(cell) + A - uOctFrac[o]) * toRel) * uExag + (hash1(base + ia, lvl + 5) - 0.5) * cellM * crumpleAmp;
  float hb = H((vec2(cell) + B - uOctFrac[o]) * toRel) * uExag + (hash1(base + ib, lvl + 5) - 0.5) * cellM * crumpleAmp;
  float hc = H((vec2(cell) + C - uOctFrac[o]) * toRel) * uExag + (hash1(base + ic, lvl + 5) - 0.5) * cellM * crumpleAmp;

  vec3 PA = vec3(A * cellM, ha), PB = vec3(B * cellM, hb), PC = vec3(C * cellM, hc);
  vec3 n = cross(PB - PA, PC - PA);
  if (n.z < 0.0) n = -n;
  vec2 g = -n.xy / max(n.z, 1e-6);

  vec2 e0 = B - A, e1 = C - B, e2 = A - C;
  float d0 = abs(e0.x * (lp.y - A.y) - e0.y * (lp.x - A.x)) / length(e0);
  float d1 = abs(e1.x * (lp.y - B.y) - e1.y * (lp.x - B.x)) / length(e1);
  float d2 = abs(e2.x * (lp.y - C.y) - e2.y * (lp.x - C.x)) / length(e2);
  float de = min(d0, min(d1, d2)) * uOctCell[o] / pf;
  return vec3(g, de);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  frag.y = uRes.y - frag.y;
  vec2 rel = vRel;
  // local footprint: data px per framebuffer px (grows with distance)
  float pf = max(length(fwidth(rel)) * 0.7071, 1e-3);

  // ---- smooth terrain ----
  // at least ~1.25 texels apart: hides bilinear texel steps at high exaggeration
  float r1 = max(1.25, 1.5 * uCssPx * pf);
  float h0 = H(rel);
  // only the pixel's own height decides whether it has data; support
  // samples (slope, facet corners) falling outside the rings don't count
  bool primaryMiss = gMiss;
  float hx = H(rel + vec2(r1, 0.0)) - H(rel - vec2(r1, 0.0));
  float hy = H(rel + vec2(0.0, r1)) - H(rel - vec2(0.0, r1));
  vec2 gSmooth = vec2(hx, hy) * uExag / (2.0 * r1 * uMpp);
  float slope = length(gSmooth);

  // ---- faceted paper surface (octaves fade out once cells get too small) ----
  float steep = smoothstep(0.05, 0.6, slope);
  float crAmp = uCrumple * (0.15 + 0.85 * steep);
  vec2 gF = vec2(0.0);
  float wsum = 0.0;
  float crease = 0.0;
  for (int o = 0; o < 4 && uFacet > 0.0; o++) {
    // fade octaves whose cells get too small in framebuffer px (cost and
    // aliasing); the small cutoff is subtracted, not stepped, so weights
    // stay continuous
    float w = max(uOctW[o] * smoothstep(2.5, 7.0, uOctCell[o] / pf) - 0.02, 0.0);
    if (w <= 0.0) continue;
    vec3 f = facet(o, rel, crAmp, pf);
    gF += f.xy * w;
    crease += (1.0 - smoothstep(0.0, 1.2 * uCssPx, f.z)) * w;
    wsum += w;
  }
  vec2 g = gSmooth;
  if (wsum > 0.001) g = mix(gSmooth, gF / wsum, uFacet * clamp(wsum * 1.5, 0.0, 1.0));
  vec3 n = normalize(vec3(-g, 1.0));

  float ao = vAO;

  // ---- cast shadow, per pixel ----
  // Step length follows the clipmap level spacing (fixed in the world, not
  // the camera distance), so shadows don't crawl while you fly.
  float sh = 1.0;
  if (uShadow > 0.0) {
    vec2 dir = normalize(uSun.xy);
    float tanE = uSun.z / length(uSun.xy);
    float stepPx = max(0.75, 0.75 * uSpacing);
    float t = 3.0 * stepPx;
    float base = h0 * uExag;
    for (int i = 0; i < 10; i++) {
      float hh = H(rel + dir * t) * uExag;
      float ray = base + t * uMpp * tanE + 25.0 * uExag;
      sh = min(sh, clamp(1.0 + (ray - hh) / (t * uMpp * 0.9 + 40.0), 0.0, 1.0));
      t *= 1.4;
      t += stepPx;
    }
    sh = mix(1.0, sh, uShadow);
  }

  // ---- light ----
  vec3 L = normalize(uSun);
  float ndl = dot(n, L);
  float diff = max(ndl, 0.0);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  vec3 paper = vec3(0.94, 0.935, 0.92);
  vec3 sunC = vec3(1.0, 0.975, 0.93);
  vec3 skyC = vec3(0.60, 0.635, 0.68);
  float sky = 0.55 + 0.45 * n.z;
  vec3 col = paper * (skyC * sky * ao * 0.62 + sunC * (0.82 * diff * sh + 0.12 * wrap));
  col *= 1.0 - 0.10 * crease * (0.4 + 0.6 * steep);

  // ---- world-anchored noise: cloud shadows ----
  if (uClouds > 0.0) {
    float cl = fbm(noiseP(0, rel));
    col *= 1.0 - uClouds * smoothstep(0.48, 0.72, cl) * 0.28;
  }

  // ---- tone ----
  col = clamp(col * uExpo, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 paperCol = mix(vec3(lum), col, 0.55);
  if (uInk < 0.999) {
    float fibre = vnoise(noiseP(2, rel)) * 0.5 + vnoise(noiseP(3, rel)) * 0.5;
    paperCol *= 0.975 + 0.05 * fibre;
  }

  // ---- ink: white paint on black paper, dry-brushed along the contours ----
  vec3 outc = paperCol;
  if (uInk > 0.001) {
    vec2 along = normalize(vec2(-g.y, g.x) + vec2(1e-4, 0.0));
    float brush = brushAlong(noiseP(4, rel), along);
    // soft threshold: paint coverage follows the light, the brush breaks it up
    float thr = 0.30 + 0.34 * brush;
    float paint = smoothstep(thr - 0.24, thr + 0.24, pow(lum, 1.2));
    vec3 white = vec3(0.93, 0.925, 0.905) * (0.62 + 0.38 * lum);
    vec3 inkCol = mix(vec3(0.062, 0.063, 0.068), white, paint);
    outc = mix(paperCol, inkCol, uInk);
  }

  // valley mist: pale haze in both modes (moonlit on black paper)
  if (uFog > 0.0) {
    float mist = fbm(noiseP(1, rel));
    float fogH = uFogAlt + (mist - 0.5) * 420.0;
    float vfog = smoothstep(fogH + 180.0, fogH - 260.0, h0) * uFog;
    outc = mix(outc, mix(vec3(0.86, 0.865, 0.87), vec3(0.42, 0.425, 0.43), uInk), vfog * mix(0.75, 0.45, uInk));
  }

  // ---- night: the land goes dark, lit only around the lamps ----
  // lamps are world points re-expressed relative to the flyer every frame (small coordinates)
  if (uNight > 0.001) {
    vec2 pm = vec2(rel.x, -rel.y) * uMpp;
    float glow = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uLampN) break;
      vec4 L = uLamps[i];
      float d = length(pm - L.xy) / max(L.z, 1.0);
      glow += L.w * exp(-d * d * 2.0);
    }
    glow = clamp(glow, 0.0, 1.0);
    vec3 darkC = outc * 0.06 + vec3(0.01);
    outc = mix(outc, mix(darkC, outc * (0.55 + 0.55 * glow), glow), uNight);
  }

  // ---- grain + vignette ----
  vec2 fp = frag / uCssPx;
  float gt = floor(uTime * 18.0);
  float grain = hash1(ivec2(fp) + ivec2(int(gt) * 131, int(gt) * 71), 9) - 0.5;
  float ol = dot(outc, vec3(0.333));
  outc += grain * mix(0.075 * (1.15 - ol), 0.06, uInk);
  vec2 uv = frag / uRes - 0.5;
  outc *= 1.0 - dot(uv, uv) * 0.55;

  // ---- horizon fog ----
  float hf = 1.0 - exp(-pow(vDist / uFogDist, 2.2));
  if (primaryMiss) hf = 1.0;
  outc = mix(outc, uFogCol, hf);

  fragColor = vec4(mix(uFogCol, outc, uFade), 1.0);
}

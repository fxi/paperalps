precision highp float;

uniform vec2 uRes;
uniform vec2 uHorizonPt;  // a point on the horizon line, framebuffer px from the top-left (may be off-screen)
uniform vec2 uHorizonN;   // unit normal of that line, pointing to the sky
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform float uTime;
uniform float uCssPx;

out vec4 fragColor;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float up = clamp(dot(frag - uHorizonPt, uHorizonN) / (uRes.y * 0.7), 0.0, 1.0);
  vec3 col = mix(uSkyLow, uSkyTop, pow(up, 0.7));
  float gt = floor(uTime * 18.0);
  col += (h12(floor(frag / uCssPx) + gt * 17.0) - 0.5) * 0.05;
  vec2 uv = frag / uRes - 0.5;
  col *= 1.0 - dot(uv, uv) * 0.5;
  fragColor = vec4(col, 1.0);
}

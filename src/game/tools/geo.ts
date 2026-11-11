/** GeoJSON flattening for the gis tool (pure, tested). */

export type LL = [number, number]; // lon, lat

export interface Flat {
  lines: LL[][];
  points: LL[];
  features: number;
  /** The text is GeoJSON (a known type at the top), not just any JSON. */
  valid: boolean;
  bbox: [number, number, number, number] | null; // w, s, e, n
  centre: LL | null; // bbox centre
}

type Geom = { type: string; coordinates?: unknown; geometries?: Geom[] };

export function flatten(json: unknown): Flat {
  const lines: LL[][] = [];
  const points: LL[] = [];
  let features = 0;
  const ll = (c: unknown): LL | null => (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' ? [c[0], c[1]] : null);
  const line = (cs: unknown) => {
    if (!Array.isArray(cs)) return;
    const l = cs.map(ll).filter((p): p is LL => !!p);
    if (l.length) lines.push(l);
  };
  const geom = (g: Geom | null | undefined): void => {
    if (!g || typeof g !== 'object') return;
    const c = g.coordinates as unknown[];
    switch (g.type) {
      case 'Point': {
        const p = ll(c);
        if (p) points.push(p);
        break;
      }
      case 'MultiPoint':
        (c ?? []).forEach((x) => {
          const p = ll(x);
          if (p) points.push(p);
        });
        break;
      case 'LineString':
        line(c);
        break;
      case 'MultiLineString':
      case 'Polygon':
        (c ?? []).forEach(line);
        break;
      case 'MultiPolygon':
        (c ?? []).forEach((poly) => (Array.isArray(poly) ? poly.forEach(line) : null));
        break;
      case 'GeometryCollection':
        (g.geometries ?? []).forEach(geom);
        break;
    }
  };
  const any = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const t = (o as { type?: string }).type;
    if (t === 'FeatureCollection') ((o as { features?: unknown[] }).features ?? []).forEach(any);
    else if (t === 'Feature') {
      features++;
      geom((o as { geometry?: Geom }).geometry);
    } else {
      features++;
      geom(o as Geom);
    }
  };
  const TYPES = ['FeatureCollection', 'Feature', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
  const valid = !!json && typeof json === 'object' && !Array.isArray(json) && TYPES.includes((json as { type?: string }).type ?? '');
  if (valid) any(json);
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of [...points, ...lines.flat()]) {
    w = Math.min(w, p[0]);
    e = Math.max(e, p[0]);
    s = Math.min(s, p[1]);
    n = Math.max(n, p[1]);
  }
  const ok = Number.isFinite(w);
  return { lines, points, features, valid, bbox: ok ? [w, s, e, n] : null, centre: ok ? [(w + e) / 2, (s + n) / 2] : null };
}

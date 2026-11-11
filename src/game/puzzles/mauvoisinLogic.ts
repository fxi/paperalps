/**
 * Mauvoisin — pure part (no imports: also run by the sealing script).
 * Lamps on the summits around the lake and the dam; a cable network that
 * reaches every lamp with the least cable. Lengths are horizontal metres on
 * a local tangent plane centred on the dam.
 */

export interface Node {
  id: string;
  name: string; // peaks.json name ('' for the dam)
  lat: number;
  lon: number;
  ele: number;
}

export const DAM: Node = { id: 'dam', name: '', lat: 45.99905, lon: 7.34055, ele: 1975 };

export const LAMPS: Node[] = [
  DAM,
  { id: 'lya', name: 'Bec de la Lya', lat: 45.98071, lon: 7.31934, ele: 3454 },
  { id: 'pleureur', name: 'Le Pleureur', lat: 46.01628, lon: 7.36911, ele: 3703 },
  { id: 'tournelon', name: 'Tournelon Blanc', lat: 45.96968, lon: 7.32181, ele: 3707 },
  { id: 'sale', name: 'La Sâle', lat: 46.02351, lon: 7.37204, ele: 3646 },
  { id: 'luette', name: 'La Luette', lat: 46.01041, lon: 7.38756, ele: 3548 },
  { id: 'chamois', name: 'Pointe des Chamois', lat: 46.0356, lon: 7.36682, ele: 3384 },
  { id: 'sery', name: 'Becca de Sery', lat: 46.01131, lon: 7.28085, ele: 2863 },
  { id: 'ruinette', name: 'La Ruinette', lat: 45.97917, lon: 7.40027, ele: 3875 },
  { id: 'corbassiere', name: 'Combin de Corbassière', lat: 45.97813, lon: 7.28046, ele: 3716 },
  { id: 'cheilon', name: 'Mont Blanc de Cheilon', lat: 45.99357, lon: 7.41723, ele: 3870 },
  { id: 'petit-combin', name: 'Petit-Combin', lat: 45.98384, lon: 7.26772, ele: 3663 },
];

const KX = Math.cos((DAM.lat * Math.PI) / 180) * 111320;
const KY = 111320;

export function dist(a: Node, b: Node): number {
  return Math.round(Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY));
}

export const edgeKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Kruskal: the minimum spanning tree as sorted edge keys, and its length. */
export function mst(nodes: Node[] = LAMPS): { edges: string[]; length: number } {
  const es: [number, string, string][] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) es.push([dist(nodes[i], nodes[j]), nodes[i].id, nodes[j].id]);
  es.sort((x, y) => x[0] - y[0]);
  const up = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (up.get(x) === x ? x : find(up.get(x)!));
  const edges: string[] = [];
  let length = 0;
  for (const [d, a, b] of es) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    up.set(ra, rb);
    edges.push(edgeKey(a, b));
    length += d;
  }
  return { edges: edges.sort(), length };
}

/** Total length of a set of edges (keys). */
export function total(edges: Iterable<string>, nodes: Node[] = LAMPS): number {
  const by = new Map(nodes.map((n) => [n.id, n]));
  let s = 0;
  for (const k of edges) {
    const [a, b] = splitKey(k, by);
    if (a && b) s += dist(a, b);
  }
  return s;
}

function splitKey(k: string, by: Map<string, Node>): [Node | undefined, Node | undefined] {
  // ids may contain '-': find the split that names two nodes
  for (let i = k.indexOf('-'); i > 0; i = k.indexOf('-', i + 1)) {
    const a = by.get(k.slice(0, i));
    const b = by.get(k.slice(i + 1));
    if (a && b) return [a, b];
  }
  return [undefined, undefined];
}

/** Lamps reached from the dam through the given edges. */
export function lit(edges: Iterable<string>, nodes: Node[] = LAMPS): Set<string> {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const k of edges) {
    const [a, b] = splitKey(k, by);
    if (!a || !b) continue;
    adj.set(a.id, [...(adj.get(a.id) ?? []), b.id]);
    adj.set(b.id, [...(adj.get(b.id) ?? []), a.id]);
  }
  const seen = new Set([DAM.id]);
  const todo = [DAM.id];
  while (todo.length) for (const n of adj.get(todo.pop()!) ?? []) if (!seen.has(n)) seen.add(n), todo.push(n);
  return seen;
}

export const answer = () => mst().edges.join(' ');

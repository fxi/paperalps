// SPOILERS: these tests know the answers of the chain.
import { describe, it, expect } from 'vitest';
import { SUMMITS, resolveSummits } from '../src/game/catalog';
import { initial, answer, saveProgress, truncate, parse } from '../src/game/state';
import { seal, unseal, okHash, norm } from '../src/game/seal';
import { openChain, accept, next, type Sealed } from '../src/game/chain';
import sealedJson from '../src/game/chain.sealed.json';
import { existsSync, readFileSync } from 'node:fs';
import { preparePeaks, type RawPeak } from '../src/ui/peaks';
import raw from '../src/data/peaks.json';
import { encrypt, decrypt, type Direction } from '../src/game/tools/xcipher';
import { gridToText, textToGrid, binToText, textToBin, hexToText, textToHex } from '../src/game/tools/bits';
import { flatten, type LL } from '../src/game/tools/geo';
import { compile, sample } from '../src/game/tools/tixy';
import * as riffel from '../src/game/puzzles/riffelseeLogic';
import * as canon from '../src/game/puzzles/canonLogic';
import * as ty from '../src/game/puzzles/tyndallLogic';
import * as mv from '../src/game/puzzles/mauvoisinLogic';
import * as midi from '../src/game/puzzles/midiLogic';

// the plain chain is kept out of the public repo: tests that read it skip without it
const PLAIN_URL = new URL('../game-src/chain.json', import.meta.url);
const HAS_PLAIN = existsSync(PLAIN_URL);
const plain: any[] = HAS_PLAIN ? JSON.parse(readFileSync(PLAIN_URL, 'utf8')) : [];

const peaks = preparePeaks(raw as RawPeak[]);
const SEALED = sealedJson as unknown as Sealed;
const midiAnswer = () => sample(compile(midi.TARGET)!, midi.FRAMES, midi.DT);
const ANSWERS = [riffel.answer(), 'wsneensw', ty.answer(), mv.answer(), midiAnswer()];

describe('catalog', () => {
  it('has 50 unique summits, each resolving to a peak', () => {
    expect(SUMMITS.length).toBe(50);
    expect(new Set(SUMMITS.map((s) => s.id)).size).toBe(50);
    const resolved = resolveSummits(peaks);
    expect(SUMMITS.filter((s) => !resolved.has(s.id)).map((s) => s.id)).toEqual([]);
  });
});

describe('game state v2', () => {
  it('records answers in order only, keeps progress, parses defensively', () => {
    const s1 = answer(initial(), 1, 'a');
    expect(s1.answers).toEqual(['a']);
    expect(answer(s1, 3, 'c')).toBe(s1); // can't skip
    expect(saveProgress(s1, 'dom', { seq: ['n'] }).progress.dom).toEqual({ seq: ['n'] });
    expect(truncate(answer(s1, 2, 'b'), 1).answers).toEqual(['a']);
    expect(parse(null)).toEqual(initial());
    expect(parse('{broken')).toEqual(initial());
    expect(parse(JSON.stringify({ v: 1, wave: 2 }))).toEqual(initial());
    expect(parse(JSON.stringify({ v: 2, answers: ['x', 3], progress: {} })).answers).toEqual(['x']);
  });
});

describe('seal', () => {
  it('opens only with the right answer, normalised', async () => {
    const box = await seal({ a: 1 }, 3, 'Hello  World');
    expect(await unseal(box, 3, ' hello world ')).toEqual({ a: 1 });
    expect(await unseal(box, 3, 'hello')).toBeNull();
    expect(await unseal(box, 2, 'hello world')).toBeNull();
    expect(await okHash(1, 'A b')).toBe(await okHash(1, 'a  B'));
    expect(norm('  É  x ')).toBe('é x');
  });
});

describe('the sealed chain', () => {
  it.skipIf(!HAS_PLAIN)('matches the plain chain, step by step', async () => {
    const { recs, answers } = await openChain(ANSWERS, SEALED);
    expect(answers.length).toBe(5);
    expect(recs.map((r) => r.summit)).toEqual(plain.map((p) => p.summit));
    for (const r of recs) expect(SUMMITS.some((s) => s.id === r.summit)).toBe(true);
    expect(await next(5, ANSWERS[4], SEALED)).toBeNull(); // the written chain ends here
  });
  it('stops at a wrong answer and accepts the right candidate', async () => {
    const { recs, answers } = await openChain([ANSWERS[0], 'nope', ANSWERS[2]], SEALED);
    expect(answers).toEqual([ANSWERS[0]]);
    expect(recs.length).toBe(2);
    expect(await accept(1, recs[0], ['x', ANSWERS[0]])).toBe(ANSWERS[0]);
    expect(await accept(2, recs[1], ['wsneensv'])).toBeNull();
  });
  it('ships no answer in the clear', () => {
    const txt = JSON.stringify(SEALED);
    for (const a of ANSWERS.slice(0, 4)) expect(txt.includes(a)).toBe(false);
  });
});

describe('tools', () => {
  // the original x app's reverse (search), to prove the port is compatible
  const xReverse = (byte: number, p: number, step: number) => {
    let un = byte;
    for (let i = 0; i < 256; i++) if (((i * 7 + step * 11) >>> 0) % 256 === byte) un = i;
    const x = un ^ p;
    const pos = step % 8;
    return ((x >> pos) | (x << (8 - pos))) & 0xff;
  };
  it('x cipher round-trips and matches x', () => {
    const key: Direction[] = ['up', 'left', 'down', 'right', 'right', 'up', 'down', 'left', 'up'];
    const msg = 'Paper Alps · 4478 · ÉÀ';
    const bits = encrypt(msg, key);
    expect(bits.split('\n').every((r) => /^[01]{8}$/.test(r))).toBe(true);
    expect(decrypt(bits, key)).toBe(msg);
    expect(decrypt(bits, key.slice(1))).not.toBe(msg);
    for (let s = 0; s < 20; s++) for (let b = 0; b < 256; b += 17) {
      const p = (((s + 1) * 23 * 0x9e3779b9) >>> 0) % 256;
      const pos = s % 8;
      const fwd = ((((((b << pos) | (b >> (8 - pos))) & 0xff) ^ p) * 7 + s * 11) >>> 0) % 256;
      expect(xReverse(fwd, p, s)).toBe(b);
    }
  });
  it('binutf grid, binary and hex round-trip', () => {
    const t = 'TYNDALL ⛰';
    expect(gridToText(textToGrid(t))).toBe(t);
    expect(gridToText(textToGrid(t, true), true)).toBe(t);
    expect(binToText(textToBin(t))).toBe(t);
    expect(hexToText(textToHex(t))).toBe(t);
    expect(textToGrid('A')[0].slice(0, 8)).toEqual([1, 0, 0, 0, 0, 0, 1, 0]); // leftmost = least significant
  });
  it('geojson: bbox and centre', () => {
    const f = flatten({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[7, 46], [8, 45]] } });
    expect(f.bbox).toEqual([7, 45, 8, 46]);
    expect(f.centre).toEqual([7.5, 45.5]);
    expect(flatten({ type: 'Point', coordinates: [1, 2] }).points).toEqual([[1, 2]]);
  });
  it('tixy samples compare behaviour, not text', () => {
    const a = compile('sin(t+x)')!;
    const b = compile('Math.sin(x+t)')!;
    expect(sample(a, 8, 0.3)).toBe(sample(b, 8, 0.3));
    expect(compile('(')).toBeNull();
  });
});

// ------------------------------------------------------------- puzzles ---

describe('1 · riffelsee', () => {
  it('accepts about ±1 km and ±15° around the pose, not further', () => {
    const { lat, lon, heading } = riffel.POSE;
    const a = riffel.answer();
    expect(riffel.candidates(lat, lon, heading)).toContain(a);
    expect(riffel.candidates(lat + 0.004, lon - 0.005, heading + 12)).toContain(a);
    expect(riffel.candidates(lat + 0.03, lon, heading)).not.toContain(a);
    expect(riffel.candidates(lat, lon, heading + 40)).not.toContain(a);
  });
});

describe('2 · canon', () => {
  it('the answer plays B A C H, then backwards', () => {
    const name: Record<number, string> = { 233.08: 'B', 220: 'A', 261.63: 'C', 246.94: 'H' };
    const seq = ANSWERS[1].split('') as canon.Petal[];
    expect(seq.length).toBe(canon.LENGTH);
    expect(seq.map((p) => name[canon.PITCH[p]]).join('')).toBe('BACHHCAB');
  });
});

describe('3 · tyndall', () => {
  it('only the target setting (and its physical twins) shows the figure clearly', () => {
    const f = ty.sheet();
    const a = ty.answer();
    expect(f.filter((x) => x.fig).length).toBeGreaterThan(20);
    let same = 0;
    let other = 0;
    for (let p = 0; p < 180; p += ty.STEP)
      for (let w = 0; w < 180; w += ty.STEP)
        for (let q = 0; q < 180; q += ty.STEP) {
          const c = ty.candidate(f, p, w, q);
          if (c === a) same++;
          else if (c) other++;
        }
    expect(same).toBe(4);
    expect(other).toBe(0);
    expect(ty.candidate(f, ...ty.TARGET)).toBe(a);
  });
});

describe('4 · mauvoisin', () => {
  it('has one minimal network, clearly shorter than any other', () => {
    const m = mv.mst();
    expect(m.edges.length).toBe(mv.LAMPS.length - 1);
    expect(mv.lit(m.edges).size).toBe(mv.LAMPS.length);
    expect(mv.total(m.edges)).toBe(m.length);
    // swapping any tree edge for any other edge that keeps it spanning costs > 300 m
    const all: string[] = [];
    for (let i = 0; i < mv.LAMPS.length; i++) for (let j = i + 1; j < mv.LAMPS.length; j++) all.push(mv.edgeKey(mv.LAMPS[i].id, mv.LAMPS[j].id));
    let best = Infinity;
    for (const out of m.edges)
      for (const inn of all) {
        if (m.edges.includes(inn)) continue;
        const e = m.edges.filter((x) => x !== out).concat(inn);
        if (mv.lit(e).size === mv.LAMPS.length) best = Math.min(best, mv.total(e) - m.length);
      }
    expect(best).toBeGreaterThan(300);
    for (const n of mv.LAMPS.slice(1)) expect(peaks.some((p) => p.name === n.name)).toBe(true);
  });
});

describe('5 · midi', () => {
  it('fits in 32 bytes; the template is not the target; a rewrite of the target is', () => {
    expect(midi.bytes(midi.TARGET)).toBeLessThanOrEqual(midi.MAX_BYTES);
    expect(midi.bytes(midi.TEMPLATE)).toBeLessThanOrEqual(midi.MAX_BYTES);
    const want = midiAnswer();
    expect(sample(compile(midi.TEMPLATE)!, midi.FRAMES, midi.DT)).not.toBe(want);
    for (const r of ['15==x+y&&1-abs(8*cos(t)+x-8)/4', 'x+y==15&&1-abs(x-8+cos(t)*8)*.25'])
      expect(sample(compile(r)!, midi.FRAMES, midi.DT)).toBe(want);
  });
  it('the tally grows with likeness, the last diamond only when exact', () => {
    const want = midiAnswer();
    const s = (f: string) => sample(compile(f)!, midi.FRAMES, midi.DT);
    const tmpl = midi.lit(s(midi.TEMPLATE), want, 16);
    const near = midi.lit(s('x+y==15&&1-abs(x+8*cos(t)-7)/4'), want, 16);
    expect(tmpl).toBeLessThan(near);
    expect(near).toBeLessThan(16);
    expect(midi.lit(want, want, 16)).toBe(16);
    expect(midi.lit(s('0'), want, 16)).toBe(0);
  });
});

describe.skipIf(!HAS_PLAIN)('clues', () => {
  it('the three bearings cross on the next summit', () => {
    const note = plain[3].notes![0];
    const f = flatten(JSON.parse(note.text));
    expect(f.lines.length).toBe(3);
    const X = (a: LL[], b: LL[]): LL => {
      const [[x1, y1], [x2, y2]] = a;
      const [[x3, y3], [x4, y4]] = b;
      const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const gc = SUMMITS.find((s) => s.id === plain[3].summit)!;
    for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
      const [lo, la] = X(f.lines[i], f.lines[j]);
      expect(Math.hypot((lo - gc.lon) * 77, la - gc.lat) * 111).toBeLessThan(0.3);
    }
  });
  it('the dam document opens with the gate sequence', () => {
    const clue = plain[4].clue as { gates: Direction[] };
    const txt = decrypt(plain[4].notes![0].text, clue.gates);
    const [lat, lon] = txt.split(' ').map(Number);
    const s = SUMMITS.find((x) => x.id === plain[4].summit)!;
    expect(Math.abs(lat - s.lat) + Math.abs(lon - s.lon)).toBeLessThan(0.001);
  });
  it('the glass spells a first ascent', () => {
    expect((plain[2].clue as { glass: string }).glass).toMatch(/^[A-Z]+ \d{4}$/);
  });
});

describe('gis', () => {
  it('tells GeoJSON from any JSON', () => {
    expect(flatten([46.5, 7.5]).valid).toBe(false);
    expect(flatten({ a: 1 }).valid).toBe(false);
    expect(flatten({ type: 'Point', coordinates: [7.5, 46.5] }).valid).toBe(true);
  });
});

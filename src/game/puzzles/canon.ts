/**
 * Dom — a rose window over an organ. Four petals, four pipes. Eight marks on
 * the rim take eight notes. Somewhere under the pedal drone, a voice, far
 * too low and the wrong way round. Solved, the glass re-leads itself.
 */
import type { PuzzleModule, PuzzleAudio } from '../puzzle';
import { svg, html, icon } from '../kit';
import { PETALS, PITCH, LENGTH, seqKey, type Petal } from './canonLogic';
import { COLS, charToRow } from '../tools/bits';
import voiceUrl from './assets/canon.wav?url';

const ANGLE: Record<Petal, number> = { n: -90, e: 0, s: 90, w: 180 };
const R = 150; // rose radius (viewBox units)
const CX = 200;
const CY = 175;

const hash = (i: number) => {
  const x = Math.sin(i * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

/** A principal pipe: a few harmonics, a breathy chiff, slow speech. */
function pipe(a: PuzzleAudio, f: number, dur = 1.6, vol = 0.16): void {
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.07);
  g.gain.setValueAtTime(vol, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
  g.connect(out);
  const real = new Float32Array(10);
  const imag = new Float32Array(10);
  for (let k = 1; k < 10; k++) real[k] = 1 / Math.pow(k, 1.35) * (k % 2 ? 1 : 0.6);
  const o = ctx.createOscillator();
  o.setPeriodicWave(ctx.createPeriodicWave(real, imag));
  o.frequency.value = f;
  const trem = ctx.createOscillator();
  trem.frequency.value = 5.2;
  const tg = ctx.createGain();
  tg.gain.value = f * 0.0025;
  trem.connect(tg).connect(o.frequency);
  o.connect(g);
  o.start(t);
  trem.start(t);
  o.stop(t + dur + 0.7);
  trem.stop(t + dur + 0.7);
  // chiff
  const n = ctx.createBufferSource();
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = b;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 4;
  bp.Q.value = 3;
  const ng = ctx.createGain();
  ng.gain.value = vol * 0.35;
  n.connect(bp).connect(ng).connect(out);
  n.start(t);
}

/** The nave: a soft pedal fifth that never stops, and the far voice. */
function nave(a: PuzzleAudio): () => void {
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, t);
  bus.gain.linearRampToValueAtTime(1, t + 4);
  bus.connect(out);
  const oscs: OscillatorNode[] = [];
  for (const [f, v] of [[73.42, 0.05], [110, 0.025], [36.71, 0.05]] as const) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = v;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    o.connect(lp).connect(g).connect(bus);
    o.start();
    oscs.push(o);
  }
  // the voice: reversed, 8× slower (three octaves down), under the pedal
  let stop = false;
  let timer = 0;
  let src: AudioBufferSourceNode | null = null;
  void fetch(voiceUrl)
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => {
      const rev = ctx.createBuffer(1, buf.length, buf.sampleRate);
      const s = buf.getChannelData(0);
      const d = rev.getChannelData(0);
      for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i];
      const vg = ctx.createGain();
      vg.gain.value = 0.9;
      vg.connect(bus);
      const play = () => {
        if (stop) return;
        src = ctx.createBufferSource();
        src.buffer = rev;
        src.playbackRate.value = 0.125;
        src.connect(vg);
        src.start();
        timer = window.setTimeout(play, (rev.duration / 0.125 + 18) * 1000);
      };
      timer = window.setTimeout(play, 5000);
    })
    .catch(() => {});
  return () => {
    stop = true;
    clearTimeout(timer);
    const t2 = ctx.currentTime;
    bus.gain.cancelScheduledValues(t2);
    bus.gain.setValueAtTime(bus.gain.value, t2);
    bus.gain.linearRampToValueAtTime(0, t2 + 1.5);
    setTimeout(() => {
      oscs.forEach((o) => o.stop());
      try {
        src?.stop();
      } catch {
        /* done */
      }
      bus.disconnect();
    }, 1700);
  };
}

/** A pane of glass: a triangle fan between two radii, faceted greys. */
function petalPath(p: Petal): string {
  const a = (ANGLE[p] * Math.PI) / 180;
  const r0 = 34;
  const r1 = R - 12;
  const w = 0.55;
  const pt = (r: number, da: number) => `${(CX + Math.cos(a + da) * r).toFixed(1)},${(CY + Math.sin(a + da) * r).toFixed(1)}`;
  return `M${pt(r0, 0)} L${pt(r0 + 30, -w)} Q${pt(r1 + 18, -w * 0.9)} ${pt(r1, 0)} Q${pt(r1 + 18, w * 0.9)} ${pt(r0 + 30, w)} Z`;
}

const mod: PuzzleModule = {
  mount(root, ctx) {
    ctx.mood('nave');
    const a = ctx.audio();
    const stopNave = a ? nave(a) : () => {};
    const wrap = html('div', { class: 'pz cn' }, root);
    const s = svg('svg', { viewBox: '0 0 400 470', class: 'cn-stage' }, wrap);

    // the lancet that holds the rose
    svg('path', { d: `M30 470V${CY}A170 170 0 0 1 370 ${CY}V470`, class: 'cn-arch' }, s);
    // background glass: small faceted panes in the whole circle
    const glass = svg('g', { class: 'cn-glass' }, s);
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * Math.PI * 2;
      const a1 = ((i + 1) / 48) * Math.PI * 2;
      for (const [r0, r1] of [[28, 80], [80, 120], [120, R]]) {
        const p = (r: number, a2: number) => `${(CX + Math.cos(a2) * r).toFixed(1)},${(CY + Math.sin(a2) * r).toFixed(1)}`;
        svg('polygon', { points: `${p(r0, a0)} ${p(r1, a0)} ${p(r1, a1)}`, style: `--s:${(0.1 + hash(i * 3 + r0) * 0.3).toFixed(2)}` }, glass);
        svg('polygon', { points: `${p(r0, a0)} ${p(r1, a1)} ${p(r0, a1)}`, style: `--s:${(0.1 + hash(i * 5 + r1) * 0.3).toFixed(2)}` }, glass);
      }
    }
    svg('circle', { cx: CX, cy: CY, r: R, class: 'cn-lead' }, s);
    svg('circle', { cx: CX, cy: CY, r: 28, class: 'cn-lead' }, s);

    // the organ: four pipes under the rose, one per petal, length ∝ 1/f
    const pipes = svg('g', { class: 'cn-organ' }, s);
    const pipeEl = {} as Record<Petal, SVGRectElement>;
    const order: Petal[] = ['w', 'n', 's', 'e']; // left to right in the case
    order.forEach((p, i) => {
      const len = (220 / PITCH[p]) * 96;
      const x = 112 + i * 52;
      const top = 470 - len;
      // a lead line from the petal down to its pipe
      const ang = (ANGLE[p] * Math.PI) / 180;
      svg('path', { d: `M${(CX + Math.cos(ang) * R).toFixed(1)} ${(CY + Math.sin(ang) * R).toFixed(1)} C ${CX + Math.cos(ang) * (R + 30)} ${CY + Math.sin(ang) * (R + 30)} ${x + 12} ${top - 50} ${x + 12} ${top}`, class: 'cn-wire' }, pipes);
      pipeEl[p] = svg('rect', { x, y: top, width: 24, height: len, class: 'cn-pipe' }, pipes);
      svg('path', { d: `M${x} ${top + 14}l12 6 12-6`, class: 'cn-mouth' }, pipes);
    });

    // petals: the four big panes (fat targets)
    const seq: Petal[] = Array.isArray((ctx.progress as { seq?: Petal[] } | null)?.seq) ? ((ctx.progress as { seq: Petal[] }).seq.filter((p) => PETALS.includes(p)).slice(0, LENGTH - 1)) : [];
    const petals = {} as Record<Petal, SVGGElement>;
    for (const p of PETALS) {
      const g = svg('g', { class: 'cn-petal', role: 'button', tabindex: '0', 'aria-label': p }, s);
      svg('path', { d: petalPath(p), class: 'cn-pane' }, g);
      petals[p] = g;
      const press = () => tap(p);
      g.addEventListener('click', press);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          press();
        }
      });
    }
    // eight marks on the rim
    const marks: SVGCircleElement[] = [];
    for (let i = 0; i < LENGTH; i++) {
      const ang = -Math.PI / 2 + (i / LENGTH) * Math.PI * 2 + Math.PI / LENGTH;
      marks.push(svg('circle', { cx: (CX + Math.cos(ang) * (R + 12)).toFixed(1), cy: (CY + Math.sin(ang) * (R + 12)).toFixed(1), r: 4.5, class: 'cn-mark' }, s));
    }
    // the boss: a muted glyph when there is no sound
    if (!a) {
      const boss = icon('speaker-slash', 'cn-boss');
      for (const [k, v] of Object.entries({ x: CX - 12, y: CY - 12, width: 24, height: 24 })) boss.setAttribute(k, String(v));
      s.appendChild(boss);
    }

    let busy = false;
    const sync = () => marks.forEach((m, i) => m.classList.toggle('on', i < seq.length));
    function flash(p: Petal): void {
      petals[p].classList.remove('lit');
      pipeEl[p].classList.remove('lit');
      void petals[p].getBoundingClientRect();
      petals[p].classList.add('lit');
      pipeEl[p].classList.add('lit');
      setTimeout(() => {
        petals[p].classList.remove('lit');
        pipeEl[p].classList.remove('lit');
      }, 260);
    }
    async function tap(p: Petal): Promise<void> {
      if (busy) return;
      flash(p);
      if (a) pipe(a, PITCH[p]);
      if (ctx.solved) return; // play freely once solved
      seq.push(p);
      sync();
      ctx.save({ seq: seq.slice(0, LENGTH - 1) });
      if (seq.length < LENGTH) return;
      busy = true;
      const ok = await ctx.submit(seqKey(seq));
      if (!ok) {
        wrap.classList.add('wrong');
        if (a) for (const f of [69.3, 73.4, 77.8]) pipe(a, f, 0.9, 0.08);
        await new Promise((r) => setTimeout(r, 900));
        wrap.classList.remove('wrong');
        seq.length = 0;
        sync();
        ctx.save({ seq: [] });
      }
      busy = false;
    }
    if (ctx.solved) seq.length = LENGTH;
    sync();
    return { destroy: stopNave };
  },

  reveal(root, clue) {
    const text = String((clue as { glass?: string } | null)?.glass ?? '');
    const rows = Array.from({ length: text.length }, (_, i) => charToRow(text[i]));
    const cell = 14;
    const w = COLS * cell;
    const h = rows.length * cell;
    const s = svg('svg', { viewBox: `-8 -${w / 2 + 8} ${w + 16} ${h + w / 2 + 16}`, class: 'cn-lancet', role: 'img', 'aria-label': 'window' }, root);
    svg('path', { d: `M0 ${h}V0A${w / 2} ${w / 2} 0 0 1 ${w} 0V${h}Z`, class: 'cn-arch' }, s);
    rows.forEach((r, y) =>
      r.forEach((v, x) => {
        const q = svg('rect', { x: x * cell + 1, y: y * cell + 1, width: cell - 2, height: cell - 2, class: v ? 'cn-on' : 'cn-off' }, s);
        q.style.animationDelay = `${(y * COLS + x) * 6}ms`;
      }),
    );
    return { destroy() {} };
  },
};
export default mod;

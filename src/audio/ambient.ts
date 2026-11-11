/**
 * Generative ambient score, pure WebAudio: dark, low and droning, but slow
 * enough to stay calm.
 *
 *   sub     — sine an octave under the bass, the floor of everything
 *   drone   — detuned saws on a minor chord, low-passed, slowly breathing;
 *             a soft throb on top grows with speed
 *   shimmer — faint high fifths that only open up at altitude
 *   tolls   — rare low FM bells, inharmonic and long
 *   motifs  — occasional two/three-note minor figures, far away in the delay
 *   rumble  — low brown noise (speed), thin air noise (altitude)
 *   vario   — like a gliding variometer, but in key: soft pings that rise in
 *             pitch and rate while climbing, a low gliding growl while sinking
 *
 * The drone never retriggers: voices glide to the next chord. Everything goes
 * through a long, dark procedural reverb. Terrain only steers timbre and
 * density, so it always stays consonant (D minor).
 */

const ROOT = 38; // D2 (MIDI)
const BPM = 44;
const STEPS_PER_CHORD = 64; // 8 bars of eighths, ~44 s
// i – bVI – iv – v(sus): bass offset + three drone voices (semitones from ROOT)
const CHORDS: { bass: number; v: [number, number, number] }[] = [
  { bass: 0, v: [7, 12, 15] }, // Dm
  { bass: -4, v: [8, 12, 15] }, // Bb
  { bass: -7, v: [8, 12, 17] }, // Gm
  { bass: -5, v: [7, 12, 16] }, // Asus4
];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // D aeolian
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17]; // D minor pentatonic, two octaves
const SINK = [0, -2, -4, -5, -7]; // sink tone steps down from A2: A, G, F, E, D
const VARIO_DEAD = 0.08;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Puzzle themes colour the same score rather than replacing it:
 *   map   — the flight score
 *   paper — drone a little lower, fewer bells, dry paper crinkles
 *   hush  — drone ducked and no events, so a puzzle's own voices lead
 *   nave  — low drone, rare bells: a stone room
 *   night — the flight score, thinner
 */
export type ThemeId = 'map' | 'paper' | 'hush' | 'nave' | 'night';
const THEMES: Record<ThemeId, { drone: number; events: number; crinkle: number }> = {
  map: { drone: 0.32, events: 1, crinkle: 0 },
  paper: { drone: 0.22, events: 0.6, crinkle: 0.18 },
  hush: { drone: 0.07, events: 0, crinkle: 0 },
  nave: { drone: 0.14, events: 0.25, crinkle: 0 },
  night: { drone: 0.26, events: 0.4, crinkle: 0 },
};

export interface Steering {
  altitude: number; // metres
  speed: number; // 0..1
  vario?: number; // -1..1, climb rate relative to the max climb
  bank?: number; // -1..1, pans the vario
}

interface Voice {
  oscs: OscillatorNode[];
}

export class Ambient {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private reverb!: ConvolverNode;
  private delayIn!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private pulseGain!: GainNode;
  private pulseAmt!: GainNode;
  private shimmerGain!: GainNode;
  private rumbleGain!: GainNode;
  private airGain!: GainNode;
  private airFilter!: BiquadFilterNode;
  private sub!: OscillatorNode;
  private bassOsc!: OscillatorNode;
  private drone: Voice[] = [];
  private shimmer: OscillatorNode[] = [];
  private chord = 0;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private steer: Steering = { altitude: 1500, speed: 0 };
  private lastEvent = 0;
  private theme: ThemeId = 'map';
  private droneBus: GainNode | null = null;
  private nextPing = 0;
  private varioPan!: StereoPannerNode;
  private sinkOsc: OscillatorNode[] = [];
  private sinkGain!: GainNode;
  private sinkFilter!: BiquadFilterNode;
  private sinkStep = -1;
  playing = false;

  setSteering(s: Steering): void {
    this.steer = s;
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    const alt = clamp01((s.altitude - 400) / 3600);
    const sp = clamp01(s.speed);
    this.droneFilter.frequency.setTargetAtTime(220 + alt * 480 + sp * 380, t, 2.5);
    const depth = 0.06 + sp * 0.38;
    this.pulseAmt.gain.setTargetAtTime(depth / 2, t, 2);
    this.pulseGain.gain.setTargetAtTime(1 - depth / 2, t, 2);
    this.shimmerGain.gain.setTargetAtTime(Math.pow(alt, 1.5) * 0.05, t, 3);
    this.rumbleGain.gain.setTargetAtTime(0.06 + sp * 0.14 + (1 - alt) * 0.04, t, 2);
    this.airGain.gain.setTargetAtTime(0.003 + alt * alt * 0.03 + sp * 0.01, t, 2);
    this.airFilter.frequency.setTargetAtTime(700 + alt * 700 + sp * 300, t, 2);

    // vario: the sinking growl follows the sink rate quickly, gliding between chord steps
    const v = Math.max(-1, Math.min(1, s.vario ?? 0));
    this.varioPan.pan.setTargetAtTime((s.bank ?? 0) * 0.6, t, 0.3);
    const sink = clamp01((-v - VARIO_DEAD) / (1 - VARIO_DEAD));
    this.sinkGain.gain.setTargetAtTime(sink > 0 ? 0.03 + sink * 0.09 : 0, t, sink > 0 ? 0.25 : 0.6);
    this.sinkFilter.frequency.setTargetAtTime(160 + sink * 520, t, 0.3);
    const step = Math.min(SINK.length - 1, Math.floor(sink * SINK.length));
    if (sink === 0) this.sinkStep = -1;
    else if (step !== this.sinkStep) {
      this.sinkStep = step;
      const f = mtof(ROOT + 7 + SINK[step]);
      this.sinkOsc.forEach((o, i) => o.frequency.setTargetAtTime(f * (i ? 0.5 : 1), t, 0.35));
    }
  }

  /** Blend to a theme over a couple of seconds. */
  setTheme(id: ThemeId): void {
    this.theme = id;
    if (!this.ctx || !this.droneBus) return;
    this.droneBus.gain.setTargetAtTime(THEMES[id].drone, this.ctx.currentTime, 1.2);
  }

  /**
   * A bus for a puzzle's own voices (through the score's room), or null when
   * the sound is off: puzzles must stay solvable without it.
   */
  puzzleAudio(): { ctx: AudioContext; out: AudioNode } | null {
    if (!this.ctx || !this.playing) return null;
    const bus = this.ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.dry);
    const send = this.ctx.createGain();
    send.gain.value = 0.25;
    bus.connect(send).connect(this.reverb);
    return { ctx: this.ctx, out: bus };
  }

  private out: AudioNode | null = null;
  private hushed = false;

  /** Silence the score (and puzzle voices) for a while, without stopping the audio context. */
  hush(on: boolean): void {
    this.hushed = on;
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? 0 : 0.85, t + (on ? 0.6 : 2));
  }
  private tapNode: MediaStreamAudioDestinationNode | null = null;

  /** A live stream of everything the score and the puzzles play (for the recorder). */
  tap(): MediaStream | null {
    if (!this.ctx || !this.out) return null;
    if (!this.tapNode) {
      this.tapNode = this.ctx.createMediaStreamDestination();
      this.out.connect(this.tapNode);
    }
    return this.tapNode.stream;
  }

  /** A short dry rustle: a few band-passed noise grains. */
  private crinkle(t: number): void {
    const ctx = this.ctx!;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.grain ?? (this.grain = noiseBuffer(ctx, 0.2, true));
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 3500;
      bp.Q.value = 1.5;
      const g = ctx.createGain();
      const at = t + i * (0.015 + Math.random() * 0.05);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.05);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 0.8;
      s.connect(bp).connect(g).connect(pan).connect(this.dry);
      s.start(at, Math.random() * 0.1);
      s.stop(at + 0.1);
    }
  }
  private grain: AudioBuffer | null = null;

  async toggle(): Promise<boolean> {
    if (this.playing) await this.pause();
    else await this.play();
    return this.playing;
  }

  async play(): Promise<void> {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    await ctx.resume();
    this.playing = true;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.hushed ? 0 : 0.85, t + 4);
    this.nextTime = t + 0.1;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 50);
    this.setSteering(this.steer);
  }

  async pause(): Promise<void> {
    if (!this.ctx) return;
    this.playing = false;
    clearInterval(this.timer);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 2);
    await new Promise((r) => setTimeout(r, 2100));
    if (!this.playing) await ctx.suspend();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.05;
    comp.release.value = 0.6;
    comp.connect(ctx.destination);
    this.out = comp;
    // no DC / infrasound
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 28;
    hp.connect(comp);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(hp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 8, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.55;
    this.dry.connect(this.master);

    // slow dark delay for motifs and tolls
    this.delayIn = ctx.createGain();
    const beat = 60 / BPM;
    const dl = ctx.createDelay(4);
    const dr = ctx.createDelay(4);
    dl.delayTime.value = beat * 1.5;
    dr.delayTime.value = beat * 2;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1100;
    this.delayIn.connect(dl);
    dl.connect(tone).connect(dr);
    dr.connect(fb).connect(dl);
    const merger = ctx.createChannelMerger(2);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.4;
    merger.connect(delayOut);
    delayOut.connect(this.reverb);
    delayOut.connect(this.dry);

    const c = CHORDS[0];

    // ---- drone: detuned saws -> throb -> low-pass ----
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.Q.value = 0.9;
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.028;
    const breatheAmt = ctx.createGain();
    breatheAmt.gain.value = 90;
    breathe.connect(breatheAmt).connect(this.droneFilter.frequency);
    breathe.start();

    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0.97;
    const pulse = ctx.createOscillator();
    pulse.frequency.value = BPM / 60 / 2; // one throb every two beats
    this.pulseAmt = ctx.createGain();
    this.pulseAmt.gain.value = 0.03;
    pulse.connect(this.pulseAmt).connect(this.pulseGain.gain);
    pulse.start();

    const droneBus = ctx.createGain();
    droneBus.gain.value = THEMES[this.theme].drone;
    this.droneBus = droneBus;
    droneBus.connect(this.pulseGain).connect(this.droneFilter);
    this.droneFilter.connect(this.dry);
    this.droneFilter.connect(this.reverb);

    c.v.forEach((deg, i) => {
      const oscs: OscillatorNode[] = [];
      for (const det of [-9, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(ROOT + deg);
        o.detune.value = det + (Math.random() - 0.5) * 3;
        // very slow, independent drift: the chord beats against itself
        const drift = ctx.createOscillator();
        drift.frequency.value = 0.03 + Math.random() * 0.05;
        const driftAmt = ctx.createGain();
        driftAmt.gain.value = 4;
        drift.connect(driftAmt).connect(o.detune);
        drift.start();
        const g = ctx.createGain();
        g.gain.value = i === 2 ? 0.07 : 0.1; // the third sits back
        const pan = ctx.createStereoPanner();
        pan.pan.value = (det < 0 ? -1 : 1) * (0.25 + i * 0.15);
        o.connect(g).connect(pan).connect(droneBus);
        o.start();
        oscs.push(o);
      }
      this.drone.push({ oscs });
    });

    // ---- sub + bass ----
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.sub.frequency.value = mtof(ROOT - 12 + c.bass);
    const subG = ctx.createGain();
    subG.gain.value = 0.2;
    this.sub.connect(subG).connect(this.dry);
    this.sub.start();
    this.bassOsc = ctx.createOscillator();
    this.bassOsc.type = 'triangle';
    this.bassOsc.frequency.value = mtof(ROOT + c.bass);
    const bassG = ctx.createGain();
    bassG.gain.value = 0.1;
    this.bassOsc.connect(bassG).connect(this.pulseGain);
    this.bassOsc.start();

    // ---- shimmer: high fifths, altitude only, reverb only ----
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0;
    const shimmerTrem = ctx.createOscillator();
    shimmerTrem.frequency.value = 0.11;
    const shimmerTremAmt = ctx.createGain();
    shimmerTremAmt.gain.value = 0.4;
    const shimmerVca = ctx.createGain();
    shimmerVca.gain.value = 0.6;
    shimmerTrem.connect(shimmerTremAmt).connect(shimmerVca.gain);
    shimmerTrem.start();
    this.shimmerGain.connect(shimmerVca).connect(this.reverb);
    for (const deg of [c.v[0] + 24, c.v[1] + 31]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(ROOT + deg);
      o.connect(this.shimmerGain);
      o.start();
      this.shimmer.push(o);
    }

    // ---- rumble + air ----
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 6);
    noise.loop = true;
    const rumbleF = ctx.createBiquadFilter();
    rumbleF.type = 'lowpass';
    rumbleF.frequency.value = 130;
    rumbleF.Q.value = 0.5;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.08;
    noise.connect(rumbleF).connect(this.rumbleGain).connect(this.dry);

    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.frequency.value = 900;
    this.airFilter.Q.value = 0.8;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.06;
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 250;
    gust.connect(gustAmt).connect(this.airFilter.frequency);
    gust.start();
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.005;
    noise.connect(this.airFilter).connect(this.airGain);
    this.airGain.connect(this.dry);
    this.airGain.connect(this.reverb);
    noise.start();

    // ---- vario: pings (climb) and a low growl (sink) ----
    this.varioPan = ctx.createStereoPanner();
    this.varioPan.connect(this.dry);
    this.varioPan.connect(this.reverb);
    this.varioPan.connect(this.delayIn);
    this.sinkFilter = ctx.createBiquadFilter();
    this.sinkFilter.type = 'lowpass';
    this.sinkFilter.frequency.value = 200;
    this.sinkFilter.Q.value = 2;
    this.sinkGain = ctx.createGain();
    this.sinkGain.gain.value = 0;
    this.sinkFilter.connect(this.sinkGain).connect(this.varioPan);
    for (const [type, det] of [
      ['sawtooth', -6],
      ['triangle', 7],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(ROOT + 7);
      o.detune.value = det;
      o.connect(this.sinkFilter);
      o.start();
      this.sinkOsc.push(o);
    }
  }

  /** Lookahead scheduler, 8th-note grid. */
  private schedule(): void {
    const ctx = this.ctx!;
    const eighth = 60 / BPM / 2;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.tick(this.step, this.nextTime);
      this.nextTime += eighth;
      this.step++;
    }
    this.varioPings();
  }

  /** Climb pings on a sixteenth grid: faster and higher the harder you climb. */
  private varioPings(): void {
    const ctx = this.ctx!;
    const climb = clamp01(((this.steer.vario ?? 0) - VARIO_DEAD) / (1 - VARIO_DEAD));
    if (climb <= 0) {
      this.nextPing = 0;
      return;
    }
    const sixteenth = 60 / BPM / 4;
    // 4, 3, 2 or 1 sixteenths apart
    const every = Math.max(1, 4 - Math.floor(climb * 4)) * sixteenth;
    // the first ping lands on the next eighth of the grid
    if (this.nextPing === 0) this.nextPing = this.nextTime;
    if (this.nextPing < ctx.currentTime) this.nextPing = ctx.currentTime + 0.02;
    while (this.nextPing < ctx.currentTime + 0.25) {
      const k = Math.min(PENTA.length - 1, Math.floor(climb * PENTA.length));
      this.ping(mtof(ROOT + 24 + PENTA[k]), this.nextPing, 0.6 + climb * 0.4);
      this.nextPing += every;
    }
  }

  private ping(f: number, t: number, vel: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    g.connect(lp).connect(this.varioPan);
    for (const [mul, amp] of [
      [1, 1],
      [2, 0.12],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1);
    }
  }

  private tick(step: number, t: number): void {
    const beat = 60 / BPM;
    const th = THEMES[this.theme];
    if (step > 0 && step % STEPS_PER_CHORD === 0) {
      this.chord = (this.chord + 1) % CHORDS.length;
      this.glideTo(CHORDS[this.chord], t);
      // a low toll marks the change
      if (th.events > 0) this.toll(mtof(ROOT + 12 + CHORDS[this.chord].bass), t + beat * 0.5, 0.8 * th.events);
      this.lastEvent = t;
      return;
    }
    // paper theme: dry crinkles of a sheet being handled, now and then
    if (th.crinkle && Math.random() < th.crinkle) this.crinkle(t + Math.random() * beat * 0.4);
    if (th.events === 0) return;
    if (step % 2 !== 0) return; // events land on beats only
    const c = CHORDS[this.chord];
    const sp = clamp01(this.steer.speed);
    if (t - this.lastEvent < beat * 4) return;

    const r = Math.random() / th.events;
    if (r < 0.05 + sp * 0.03) {
      // toll on a chord tone, octave 2-3
      const deg = [c.bass, c.v[0], c.v[1]][Math.floor(Math.random() * 3)];
      const oct = deg + 12 > 14 ? 0 : 12;
      this.toll(mtof(ROOT + deg + oct), t, 0.5 + Math.random() * 0.4);
      this.lastEvent = t;
    } else if (r < 0.1 + sp * 0.08) {
      this.motif(t, c);
      this.lastEvent = t;
    }
  }

  private glideTo(c: (typeof CHORDS)[number], t: number): void {
    const tau = 3.5;
    c.v.forEach((deg, i) => {
      for (const o of this.drone[i].oscs) o.frequency.setTargetAtTime(mtof(ROOT + deg), t, tau);
    });
    this.sub.frequency.setTargetAtTime(mtof(ROOT - 12 + c.bass), t, tau);
    this.bassOsc.frequency.setTargetAtTime(mtof(ROOT + c.bass), t, tau);
    this.shimmer[0].frequency.setTargetAtTime(mtof(ROOT + c.v[0] + 24), t, tau * 1.5);
    this.shimmer[1].frequency.setTargetAtTime(mtof(ROOT + c.v[1] + 31), t, tau * 1.5);
  }

  /** Low FM bell: soft strike, long inharmonic decay. */
  private toll(f: number, t: number, vel: number): void {
    const ctx = this.ctx!;
    const dur = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.8;
    g.connect(lp).connect(pan);
    pan.connect(this.reverb);
    pan.connect(this.dry);
    pan.connect(this.delayIn);

    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 1.41;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 4);
    mod.connect(idx).connect(car.frequency);
    car.connect(g);
    // a quiet partial just under the octave darkens the ring
    const p = ctx.createOscillator();
    p.type = 'sine';
    p.frequency.value = f * 1.93;
    const pg = ctx.createGain();
    pg.gain.value = 0.15;
    p.connect(pg).connect(g);
    for (const o of [car, mod, p]) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** Two or three slow minor notes, muted, mostly heard through the delay. */
  private motif(t: number, c: (typeof CHORDS)[number]): void {
    const beat = 60 / BPM;
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    // start on a chord tone, then step through the scale
    let deg = c.v[Math.floor(Math.random() * 3)] % 12;
    let idx = MINOR.indexOf(deg);
    if (idx < 0) idx = 0;
    const dir = Math.random() < 0.6 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      deg = MINOR[(idx + MINOR.length * 4) % MINOR.length];
      this.note(mtof(ROOT + 12 + deg), t + i * beat * (1.5 + Math.random() * 0.5), 0.5 - i * 0.1);
      idx += dir * (1 + (Math.random() < 0.3 ? 1 : 0));
    }
  }

  private note(f: number, t: number, vel: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 750;
    lp.Q.value = 1.2;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.2;
    g.connect(lp).connect(pan);
    pan.connect(this.delayIn);
    pan.connect(this.reverb);
    pan.connect(this.dry);
    for (const [type, det] of [
      ['triangle', -4],
      ['sawtooth', 5],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = type === 'sawtooth' ? 0.35 : 1;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 4.6);
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Long reverb tail that darkens as it decays (one-pole low-pass closing over time). */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const a = 0.5 - 0.47 * Math.sqrt(x); // filter coefficient: bright onset, dark tail
      y += a * ((Math.random() * 2 - 1) - y);
      d[i] = y * 2.2 * Math.pow(1 - x, decay) * (x < 0.02 ? x / 0.02 : 1);
    }
  }
  return buf;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, white = false): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    if (white) {
      d[i] = Math.random() * 2 - 1;
      continue;
    }
    // brownish noise
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = b * 3.5;
  }
  return buf;
}

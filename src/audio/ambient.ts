/**
 * Generative ambient score, pure WebAudio.
 *
 *   pad    — slow detuned-saw chords through a low-pass, long swells
 *   plucks — sparse pentatonic bell notes into a ping-pong delay
 *   bass   — soft sine root
 *   wind   — filtered noise that thickens with altitude
 *
 * Everything goes through a procedurally generated convolution reverb.
 * Terrain only *steers* the music (brightness, register, density, wind), so it
 * always stays consonant: the harmony is fixed to D major pentatonic colours.
 */

const ROOT = 50; // D3 (MIDI)
// Chords as scale degrees (semitones from root): Dadd9, Bm7, Gmaj9, Asus2.
const CHORDS = [
  [0, 7, 14, 16],
  [-3, 4, 9, 14],
  [-7, 0, 7, 11, 14],
  [-5, 2, 7, 9],
];
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
const BPM = 66;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Steering {
  altitude: number; // metres
  speed: number; // 0..1
}

export class Ambient {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padBus!: GainNode;
  private padFilter!: BiquadFilterNode;
  private pluckBus!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private steer: Steering = { altitude: 1500, speed: 0 };
  private lastPluck = 0;
  playing = false;

  setSteering(s: Steering): void {
    this.steer = s;
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    const alt = clamp01((s.altitude - 400) / 3600);
    this.padFilter.frequency.setTargetAtTime(500 + alt * 2200, t, 1.5);
    this.windGain.gain.setTargetAtTime(0.012 + alt * alt * 0.07 + s.speed * 0.02, t, 1.2);
    this.windFilter.frequency.setTargetAtTime(380 + alt * 900 + s.speed * 400, t, 1.0);
  }

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
    this.master.gain.linearRampToValueAtTime(0.8, t + 2.5);
    this.nextTime = t + 0.1;
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
    this.master.gain.linearRampToValueAtTime(0, t + 1.5);
    await new Promise((r) => setTimeout(r, 1600));
    if (!this.playing) await ctx.suspend();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 5.5, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(this.master);
    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    dry.connect(this.master);

    // pad
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.4;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.16;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(dry);
    this.padFilter.connect(reverb);
    // slow filter breathing
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency);
    lfo.start();

    // plucks -> ping-pong delay -> reverb
    this.pluckBus = ctx.createGain();
    this.pluckBus.gain.value = 0.22;
    const merger = ctx.createChannelMerger(2);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    const beat = 60 / BPM;
    dl.delayTime.value = beat * 0.75;
    dr.delayTime.value = beat * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.pluckBus.connect(dl);
    dl.connect(tone).connect(dr);
    dr.connect(fb).connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.35;
    merger.connect(delayOut);
    delayOut.connect(dry);
    delayOut.connect(reverb);
    this.pluckBus.connect(dry);
    this.pluckBus.connect(reverb);

    // wind
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 4);
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.07;
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 180;
    gust.connect(gustAmt).connect(this.windFilter.frequency);
    gust.start();
    noise.connect(this.windFilter).connect(this.windGain);
    this.windGain.connect(dry);
    this.windGain.connect(reverb);
    noise.start();
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
  }

  private tick(step: number, t: number): void {
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const beat = 60 / BPM;

    // New chord every 2 bars: long overlapping swells.
    if (step % 16 === 0) {
      const dur = beat * 8 + 3;
      chord.forEach((deg, i) => this.padVoice(mtof(ROOT + deg), t + i * 0.12, dur));
      this.bass(mtof(ROOT - 12 + chord[0]), t, dur);
    }

    // Sparse plucks: density follows speed, register follows altitude.
    const { speed, altitude } = this.steer;
    const p = 0.1 + speed * 0.35 + (step % 4 === 0 ? 0.12 : 0);
    if (Math.random() < p && t - this.lastPluck > 0.2) {
      this.lastPluck = t;
      const alt = clamp01((altitude - 400) / 3600);
      const octave = 12 + Math.round(alt * 1.4) * 12;
      // prefer chord tones on strong beats
      const pool = step % 4 === 0 ? chord.map((d) => ((d % 12) + 12) % 12) : PENTA;
      const deg = pool[Math.floor(Math.random() * pool.length)];
      const vel = 0.4 + Math.random() * 0.5;
      this.pluck(mtof(ROOT + octave + deg), t, vel);
      // occasional answering note a fifth/octave up
      if (Math.random() < 0.18) this.pluck(mtof(ROOT + octave + deg + (Math.random() < 0.5 ? 7 : 12)), t + beat * 0.75, vel * 0.6);
    }
  }

  private padVoice(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 3.5);
    g.gain.setValueAtTime(0.22, t + dur - 3);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
    g.connect(this.padBus);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det + (Math.random() - 0.5) * 4;
      const pan = ctx.createStereoPanner();
      pan.pan.value = det < 0 ? -0.4 : 0.4;
      o.connect(pan).connect(g);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
  }

  private bass(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 2);
    g.gain.setValueAtTime(0.16, t + dur - 2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1);
    o.connect(g).connect(this.padBus);
    o.start(t);
    o.stop(t + dur + 1.1);
  }

  private pluck(f: number, t: number, vel: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.2;
    g.connect(pan).connect(this.pluckBus);
    // bell: fundamental + soft inharmonic partial
    for (const [mul, amp] of [
      [1, 1],
      [2.76, 0.18],
      [4.07, 0.06],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const pg = ctx.createGain();
      pg.gain.value = amp;
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (x < 0.01 ? x / 0.01 : 1);
    }
  }
  return buf;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    // brownish noise
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = b * 3.5;
  }
  return buf;
}

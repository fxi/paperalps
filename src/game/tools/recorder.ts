/**
 * recorder — records what the game plays (or the microphone), keeps it as a
 * sound note, and plays any sound note at another speed, or backwards. The
 * waveform is drawn in ink so a sound can be read as well as heard.
 */
import type { ToolModule } from './index';
import type { Note } from '../notes';
import { html, glyph, setIcon, icon, inkColors } from '../kit';
import { notePicker, row, stamp } from './common';

const SPEEDS = [0.05, 0.0625, 0.1, 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20];

export function reverseBuffer(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    const dst = r.getChannelData(c);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return r;
}

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-recorder');
    const a = host.audio();
    if (!a) {
      // sound is off: the recorder has nothing to listen to
      html('div', { class: 'tl-mute', 'aria-label': 'sound off' }, root).appendChild(icon('speaker-slash'));
      return { destroy() {} };
    }
    const ctx = a.ctx;
    let buf: AudioBuffer | null = null;
    let rev: AudioBuffer | null = null;
    let note: Note | null = null;
    let src: AudioBufferSourceNode | null = null;
    let startedAt = 0;
    let rec: MediaRecorder | null = null;
    let mic: MediaStream | null = null;
    let speedI = SPEEDS.indexOf(1);
    let backwards = false;
    let raf = 0;

    const top = row(root);
    const recBtn = glyph(top, 'record', 'record', () => void toggleRec(false));
    const micBtn = glyph(top, 'microphone', 'microphone', () => void toggleRec(true));
    let hushed = false;
    const hushBtn = glyph(top, 'music-notes', 'game music', () => {
      hushed = !hushed;
      a.hush(hushed);
      setIcon(hushBtn, hushed ? 'music-notes-minus' : 'music-notes');
      hushBtn.classList.toggle('on', hushed);
    });
    notePicker(top, host.notes, ['sound'], (n) => void load(n));
    const title = html('span', { class: 'tl-title' }, top, '·');

    const cv = html('canvas', { class: 'tl-wave', height: '120' }, root);
    const ctl = row(root, 'tl-transport');
    const playBtn = glyph(ctl, 'play', 'play', () => (src ? stop() : play()));
    const revBtn = glyph(ctl, 'arrows-left-right', 'reverse', () => {
      backwards = !backwards;
      revBtn.classList.toggle('on', backwards);
      if (src) play();
      paint();
    });
    const slow = glyph(ctl, 'minus', 'slower', () => setSpeed(speedI - 1));
    const speedEl = html('span', { class: 'tl-speed' }, ctl);
    const fast = glyph(ctl, 'plus', 'faster', () => setSpeed(speedI + 1));
    void slow;
    void fast;

    function setSpeed(i: number): void {
      speedI = Math.max(0, Math.min(SPEEDS.length - 1, i));
      speedEl.textContent = `×${SPEEDS[speedI]}`;
      if (src) src.playbackRate.setTargetAtTime(SPEEDS[speedI], ctx.currentTime, 0.02);
    }
    setSpeed(speedI);

    async function load(n: Note): Promise<void> {
      stop();
      const b = await host.notes.blob(n);
      if (!b) return;
      try {
        buf = await ctx.decodeAudioData(await b.arrayBuffer());
      } catch {
        buf = null;
      }
      rev = buf ? reverseBuffer(ctx, buf) : null;
      note = n;
      title.textContent = n.label;
      paint();
    }

    function play(): void {
      stop();
      const b = backwards ? rev : buf;
      if (!b) return;
      src = ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = SPEEDS[speedI];
      src.connect(a!.direct);
      src.onended = () => {
        if (src && src.buffer === b) stop();
      };
      startedAt = ctx.currentTime;
      src.start();
      setIcon(playBtn, 'stop');
      tick();
    }
    function stop(): void {
      if (src) {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* not started */
        }
        src.disconnect();
      }
      src = null;
      setIcon(playBtn, 'play');
      cancelAnimationFrame(raf);
      paint();
    }
    function tick(): void {
      paint();
      if (src) raf = requestAnimationFrame(tick);
    }

    function paint(): void {
      const w = (cv.width = cv.clientWidth * devicePixelRatio || 300);
      const h = cv.height;
      const g = cv.getContext('2d')!;
      const c = inkColors();
      g.clearRect(0, 0, w, h);
      g.strokeStyle = c.faint;
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
      const b = backwards ? rev : buf;
      if (!b) return;
      const d = b.getChannelData(0);
      const step = Math.max(1, Math.floor(d.length / w));
      g.fillStyle = c.ink;
      for (let x = 0; x < w; x++) {
        let lo = 1;
        let hi = -1;
        for (let i = x * step, e = Math.min(d.length, i + step); i < e; i++) {
          if (d[i] < lo) lo = d[i];
          if (d[i] > hi) hi = d[i];
        }
        if (hi < lo) continue;
        g.fillRect(x, h / 2 - hi * h * 0.45, 1, Math.max(1, (hi - lo) * h * 0.45));
      }
      if (src) {
        const pos = ((ctx.currentTime - startedAt) * SPEEDS[speedI]) / b.duration;
        g.fillStyle = c.soft;
        g.fillRect(Math.min(w - 1, pos * w), 0, 1.5, h);
      }
    }

    async function toggleRec(fromMic: boolean): Promise<void> {
      if (rec) {
        rec.stop();
        return;
      }
      let stream: MediaStream;
      try {
        stream = fromMic ? (mic = await navigator.mediaDevices.getUserMedia({ audio: true })) : a!.tap();
      } catch {
        micBtn.disabled = true;
        return;
      }
      const chunks: Blob[] = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        mic?.getTracks().forEach((t) => t.stop());
        mic = null;
        rec = null;
        recBtn.classList.remove('on');
        micBtn.classList.remove('on');
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
        const n = host.notes.add({ id: `r-${Date.now()}`, kind: 'sound', label: stamp() }, blob);
        void load(n);
      };
      rec.start();
      (fromMic ? micBtn : recBtn).classList.add('on');
    }

    void note;
    const ro = new ResizeObserver(() => paint());
    ro.observe(cv);
    return {
      destroy() {
        stop();
        rec?.stop();
        ro.disconnect();
        if (hushed) a.hush(false); // the music comes back when the recorder closes
      },
    };
  },
};
export default mod;

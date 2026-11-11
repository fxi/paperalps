/**
 * quine — code on one side, its render on the other. Two modes:
 *   </>  a page, run in a sandboxed iframe (its console comes back here)
 *   ƒ    a tixy field: the body of (t, i, x, y) => …
 */
import type { ToolModule } from './index';
import { html, glyph, setIcon, field, inkColors } from '../kit';
import { notePicker, row, stamp } from './common';
import { compile, frame, paint } from './tixy';

// fxi's skull quine (fxi.io/quines): a page that prints its own source, the
// skull drawn by the bits of a UTF-16 string
const SKULL = `<body bgcolor=x onload='setInterval(f=e=>{for(i=0,w=20,t++,e="",l=f+e;i<l.length;e+=\`<f style="background:\${"ѱ˺ǼĤĤǼǜɲѱ".charCodeAt(i/w)&1<<i%w-t?\`hsl(\${(i-20*t)%360},100%,50%)\`:\`#111\`}">\${l[i++]}</f>\${i%w?"":"\\n"}\`);p.innerHTML=e/*๏_๏*/ },t=99)'><pre id="p">`;

const RELAY = `<script>(()=>{const s=(k,a)=>parent.postMessage({__q:1,k,a:a.map(String)},'*');for(const k of ['log','info','warn','error']){const o=console[k];console[k]=(...a)=>{s(k,a);o.apply(console,a)}}addEventListener('error',e=>s('error',[e.message]))})()</script>`;

let saved = { mode: 'html' as 'html' | 'tixy', html: SKULL, tixy: 'sin(y/8+t)' };

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-quine');
    const bar = row(root);
    const modeBtn = glyph(bar, saved.mode === 'html' ? 'code' : 'function', 'mode', () => {
      saved[saved.mode] = code.value;
      saved.mode = saved.mode === 'html' ? 'tixy' : 'html';
      setIcon(modeBtn, saved.mode === 'html' ? 'code' : 'function');
      code.value = saved[saved.mode];
      run();
    });
    glyph(bar, 'play', 'run', () => run());
    notePicker(bar, host.notes, ['text'], (n) => {
      code.value = n.text ?? '';
      run();
    });
    glyph(bar, 'download-simple', 'keep', () => host.notes.add({ id: `q-${Date.now()}`, kind: 'text', label: `${saved.mode === 'html' ? 'html' : 'tixy'} ${stamp()}`, text: code.value }));
    glyph(bar, 'arrow-u-up-left', 'sample', () => {
      code.value = saved.mode === 'html' ? SKULL : 'sin(y/8+t)';
      run();
    });

    const code = field(root, 8, 'tl-code');
    code.value = saved[saved.mode];
    const stage = html('div', { class: 'tl-stage' }, root);
    const log = html('pre', { class: 'tl-log', 'aria-live': 'polite' }, root);

    let frameEl: HTMLIFrameElement | null = null;
    let cv: HTMLCanvasElement | null = null;
    let raf = 0;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameEl?.contentWindow || !e.data?.__q) return;
      log.textContent = (log.textContent + `\n${e.data.k === 'log' ? '›' : '!'} ${e.data.a.join(' ')}`).split('\n').slice(-40).join('\n').trim();
      log.scrollTop = log.scrollHeight;
    };
    addEventListener('message', onMsg);

    function run(): void {
      saved[saved.mode] = code.value;
      cancelAnimationFrame(raf);
      stage.replaceChildren();
      log.textContent = '';
      frameEl = cv = null;
      if (saved.mode === 'html') {
        frameEl = html('iframe', { sandbox: 'allow-scripts', title: 'render' }, stage);
        frameEl.srcdoc = RELAY + code.value;
        return;
      }
      cv = html('canvas', { width: '256', height: '256', class: 'tl-tixy' }, stage);
      const f = compile(code.value);
      if (!f) {
        log.textContent = '! ƒ';
        return;
      }
      const g = cv.getContext('2d')!;
      const t0 = performance.now();
      const ink = inkColors().ink;
      const loop = (now: number) => {
        paint(g, frame(f, (now - t0) / 1000), 256, ink);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    let deb = 0;
    code.addEventListener('input', () => {
      clearTimeout(deb);
      deb = window.setTimeout(run, saved.mode === 'tixy' ? 150 : 600);
    });
    run();
    return {
      destroy() {
        saved[saved.mode] = code.value;
        cancelAnimationFrame(raf);
        clearTimeout(deb);
        removeEventListener('message', onMsg);
      },
    };
  },
};
export default mod;

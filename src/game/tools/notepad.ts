/**
 * notepad — everything kept: documents filed by the game, own text, pasted
 * or loaded images, sounds, recordings. A note can be carried (✋) to a drop
 * zone; a photo can be laid over the view (◎), flipped (⇅) and shot (◉).
 */
import type { ToolModule, ToolHost } from './index';
import type { Note } from '../notes';
import { html, glyph, icon, field, pickFile } from '../kit';
import { noteIcon, row, stamp } from './common';

function list(root: HTMLElement, host: ToolHost, open: (n: Note) => void): void {
  root.replaceChildren();
  const bar = row(root);
  glyph(bar, 'note-pencil', 'new', () => {
    const n = host.notes.add({ id: `t-${Date.now()}`, kind: 'text', label: stamp(), text: '' });
    open(n);
  });
  glyph(bar, 'upload-simple', 'file', async () => {
    const f = await pickFile('image/*,audio/*,.json,.geojson,.txt,text/*');
    if (!f) return;
    const kind = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'sound' : 'text';
    const id = `f-${Date.now()}`;
    if (kind === 'text') host.notes.add({ id, kind, label: f.name.slice(0, 24), text: await f.text() });
    else host.notes.add({ id, kind, label: f.name.slice(0, 24) }, f);
  });
  // paste anything into the list
  const paste = field(bar, 1, 'tl-paste');
  paste.setAttribute('aria-label', 'paste');
  bar.insertBefore(icon('clipboard-text', 'tl-paste-ico'), paste);
  paste.addEventListener('paste', (e) => {
    e.preventDefault();
    const f = Array.from(e.clipboardData?.files ?? [])[0];
    const id = `p-${Date.now()}`;
    if (f && (f.type.startsWith('image/') || f.type.startsWith('audio/'))) {
      host.notes.add({ id, kind: f.type.startsWith('image/') ? 'image' : 'sound', label: stamp() }, f);
    } else {
      const t = e.clipboardData?.getData('text') ?? '';
      if (t) host.notes.add({ id, kind: 'text', label: stamp(), text: t });
    }
  });

  const ul = html('ul', { class: 'tl-notes' }, root);
  const items = host.notes.list().slice().reverse();
  if (!items.length) html('li', { class: 'tl-menu-empty' }, ul).appendChild(icon('minus'));
  for (const n of items) {
    const li = html('li', { class: host.notes.carried === n.id ? 'carried' : '' }, ul);
    const b = html('button', { class: 'tl-note', type: 'button' }, li);
    html('span', { class: 'tl-k' }, b).appendChild(noteIcon(n));
    html('span', { class: 'tl-label' }, b, n.label);
    if (n.step) html('span', { class: 'tl-step' }, b, String(n.step).padStart(2, '0'));
    b.addEventListener('click', () => open(n));
    glyph(li, 'hand-grabbing', 'carry', () => host.notes.carry(host.notes.carried === n.id ? null : n.id), host.notes.carried === n.id ? 'on' : '');
  }
}

function view(root: HTMLElement, host: ToolHost, n: Note, back: () => void): () => void {
  root.replaceChildren();
  const bar = row(root);
  glyph(bar, 'arrow-left', 'back', back);
  const title = html('span', { class: 'tl-title' }, bar);
  title.append(noteIcon(n), ` ${n.label}`);
  const spacer = html('span', { class: 'tl-grow' }, bar);
  void spacer;
  const cleanup: (() => void)[] = [];
  if (!n.step) {
    glyph(bar, 'trash', 'delete', () => {
      host.notes.remove(n.id);
      back();
    });
  }
  if (n.kind === 'text') {
    const t = field(root, 12);
    t.value = n.text ?? '';
    t.readOnly = !!n.step; // documents from the game stay as they were
    t.addEventListener('input', () => host.notes.add({ ...n, text: t.value }));
  } else if (n.kind === 'image' || n.kind === 'photo') {
    const fig = html('div', { class: 'tl-img' }, root);
    void host.notes.src(n).then((src) => {
      if (!src) return;
      const img = html('img', { src, alt: n.label }, fig);
      if (!n.url && n.blob) cleanup.push(() => URL.revokeObjectURL(img.src));
    });
    const sky = (n.data as { az?: number[]; el?: number[] } | undefined) ?? {};
    if (n.kind === 'photo' && sky.az && sky.el) {
      const w = host.world;
      const on = () => w.ghost !== null;
      const ghost = glyph(bar, 'frame-corners', 'overlay', () => {
        if (on()) w.setGhost(null);
        else w.setGhost({ az: sky.az!, el: sky.el!, flip: flip.classList.contains('on') }, () => host.game.shutter());
        sync();
      });
      const flip = glyph(bar, 'arrows-down-up', 'flip', () => {
        flip.classList.toggle('on');
        fig.classList.toggle('flip', flip.classList.contains('on'));
        if (w.ghost) w.ghost.flip = flip.classList.contains('on');
      });
      const sync = () => ghost.classList.toggle('on', on());
      if (w.ghost) flip.classList.toggle('on', w.ghost.flip);
      fig.classList.toggle('flip', flip.classList.contains('on'));
      sync();
    }
  } else if (n.kind === 'sound') {
    const audio = html('audio', { controls: '', preload: 'metadata' }, root);
    void host.notes.src(n).then((src) => {
      if (!src) return;
      audio.src = src;
      if (!n.url && n.blob) cleanup.push(() => URL.revokeObjectURL(src));
    });
  }
  return () => cleanup.forEach((f) => f());
}

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-notepad');
    let opened: Note | null = null;
    let undo: (() => void) | null = null;
    const render = () => {
      undo?.();
      undo = null;
      if (opened) {
        const n = host.notes.get(opened.id);
        if (n) {
          undo = view(root, host, n, () => {
            opened = null;
            render();
          });
          return;
        }
        opened = null;
      }
      list(root, host, (n) => {
        opened = n;
        render();
      });
    };
    // re-render the list on changes, but not while typing in a note
    const off = host.notes.subscribe(() => {
      if (!opened) render();
    });
    render();
    return {
      destroy() {
        off();
        undo?.();
      },
    };
  },
};
export default mod;

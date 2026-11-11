/** Bits shared by the tools: the note picker, the glyph per note kind. */
import type { Note, NoteKind, Notes } from '../notes';
import { html, glyph, icon, type IconName } from '../kit';

export const KIND_ICON: Record<NoteKind, IconName> = { text: 'file-text', image: 'image', sound: 'waveform', photo: 'camera' };

/** The icon of a note: its own, or its kind's. */
export const noteIcon = (n: Note) => icon(n.icon ?? KIND_ICON[n.kind]);

/** A button opening a small list of notes of the given kinds. */
export function notePicker(parent: Element, notes: Notes, kinds: NoteKind[], onPick: (n: Note) => void): HTMLButtonElement {
  let menu: HTMLElement | null = null;
  const close = () => {
    menu?.remove();
    menu = null;
  };
  const b = glyph(parent, 'tray-arrow-down', 'notes', () => {
    if (menu) return close();
    const items = notes.list().filter((n) => kinds.includes(n.kind));
    menu = html('div', { class: 'tl-menu', role: 'menu' }, b.parentElement ?? parent);
    if (!items.length) html('div', { class: 'tl-menu-empty' }, menu).appendChild(icon('minus'));
    for (const n of items.slice().reverse()) {
      const it = html('button', { class: 'tl-menu-item', type: 'button', role: 'menuitem' }, menu);
      html('span', { class: 'tl-k' }, it).appendChild(noteIcon(n));
      html('span', {}, it, n.label);
      it.addEventListener('click', () => {
        close();
        onPick(n);
      });
    }
  });
  return b;
}

export function row(parent: Element, cls = ''): HTMLElement {
  return html('div', { class: `tl-row ${cls}`.trim() }, parent);
}

export const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
};

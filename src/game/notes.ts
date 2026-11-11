/**
 * The notepad: everything the player keeps (documents filed by puzzles,
 * pasted text, images, recordings). Metadata lives in localStorage; binary
 * payloads (images, sounds) in IndexedDB. One item can be "carried" to a
 * drop zone (in a puzzle or in the world): that is the inventory.
 */

import type { IconName } from '../ui/icons';

export type NoteKind = 'text' | 'image' | 'sound' | 'photo';

export interface Note {
  id: string;
  kind: NoteKind;
  /** Short label, no prose: a step number, a time stamp. */
  label: string;
  /** Icon override (else the kind decides). */
  icon?: IconName;
  text?: string; // text notes, GeoJSON, bit rows...
  url?: string; // a bundled asset (image / sound)
  blob?: boolean; // payload stored in IndexedDB under the note id
  data?: unknown; // kind-specific (e.g. a photo's skyline)
  step?: number; // filed by step n
  t: number;
}

/** A note as written in the sealed chain (filed when the step opens). */
export type NoteSeed = Omit<Note, 't' | 'blob'>;

const KEY = 'paperalps.notes.v1';
const DB = 'paperalps';
const STORE = 'blobs';

type Listener = () => void;

export class Notes {
  private items: Note[] = [];
  private listeners = new Set<Listener>();
  carried: string | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? (JSON.parse(raw) as Note[]) : [];
      this.items = Array.isArray(arr) ? arr.filter((n) => n && typeof n.id === 'string') : [];
      // older saves prefixed labels with a Unicode glyph (▤ 02): the icon now carries it
      for (const n of this.items) if (typeof n.label === 'string') n.label = n.label.replace(/^[^\x00-\x7f]+\s+/u, '');
    } catch {
      this.items = [];
    }
  }

  list(): readonly Note[] {
    return this.items;
  }

  get(id: string): Note | undefined {
    return this.items.find((n) => n.id === id);
  }

  has(id: string): boolean {
    return this.items.some((n) => n.id === id);
  }

  /** Add or replace (same id). */
  add(n: Omit<Note, 't'> & { t?: number }, payload?: Blob): Note {
    const note: Note = { ...n, t: n.t ?? Date.now(), blob: payload ? true : n.blob };
    const i = this.items.findIndex((x) => x.id === note.id);
    if (i >= 0) this.items[i] = note;
    else this.items.push(note);
    if (payload) void idb('readwrite', (s) => s.put(payload, note.id));
    this.persist();
    return note;
  }

  remove(id: string): void {
    const n = this.get(id);
    this.items = this.items.filter((x) => x.id !== id);
    if (n?.blob) void idb('readwrite', (s) => s.delete(id));
    if (this.carried === id) this.carried = null;
    this.persist();
  }

  /** Binary payload as an object URL (or the bundled asset URL). */
  async src(n: Note): Promise<string | null> {
    if (n.url) return n.url;
    if (!n.blob) return null;
    const b = await idb<Blob | undefined>('readonly', (s) => s.get(n.id));
    return b ? URL.createObjectURL(b) : null;
  }

  async blob(n: Note): Promise<Blob | null> {
    if (n.url) return fetch(n.url).then((r) => r.blob()).catch(() => null);
    if (!n.blob) return null;
    return (await idb<Blob | undefined>('readonly', (s) => s.get(n.id))) ?? null;
  }

  carry(id: string | null): void {
    this.carried = id;
    this.emit();
  }

  /** Hand over the carried note (a drop zone accepted it). */
  take(): Note | null {
    const n = this.carried ? (this.get(this.carried) ?? null) : null;
    this.carried = null;
    this.emit();
    return n;
  }

  subscribe(f: Listener): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* full or private: keep in memory */
    }
    this.emit();
  }

  private emit(): void {
    for (const f of this.listeners) f();
  }
}

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((res, rej) => {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result as T);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return undefined;
  }
}

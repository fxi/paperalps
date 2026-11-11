/**
 * Le chanoine — pure part. Four petals of the rose, four organ pipes. The
 * lock takes eight notes; the answer is the petal sequence.
 */
export type Petal = 'n' | 'e' | 's' | 'w';
export const PETALS: Petal[] = ['n', 'e', 's', 'w'];

/** Pipe pitch per petal (Hz): C4, B3, A3, B♭3. */
export const PITCH: Record<Petal, number> = { n: 261.63, e: 246.94, s: 220.0, w: 233.08 };

export const LENGTH = 8;
export const seqKey = (seq: Petal[]) => seq.join('');

// Opt-in network check (NET=1): fetch the Matterhorn tile, decode with the
// system `dwebp` if present, and confirm the summit elevation.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeTerrarium } from '../src/dem/decode';

const run = process.env.NET ? describe : describe.skip;

run('mapterhorn tile (network)', () => {
  it('Matterhorn summit ≈ 4478 m', async () => {
    const res = await fetch('https://tiles.mapterhorn.com/12/2135/1457.webp');
    expect(res.ok).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'paperalps-'));
    writeFileSync(join(dir, 't.webp'), Buffer.from(await res.arrayBuffer()));
    execFileSync('dwebp', ['-pam', join(dir, 't.webp'), '-o', join(dir, 't.pam')], { stdio: 'ignore' });
    const pam = readFileSync(join(dir, 't.pam'));
    const off = pam.indexOf('ENDHDR\n') + 7;
    const h = decodeTerrarium(new Uint8Array(pam.subarray(off)));
    let max = -Infinity;
    for (const v of h) max = Math.max(max, v);
    expect(Math.abs(max - 4478)).toBeLessThan(10);
  }, 20000);
});

/**
 * gis — paste GeoJSON (or pick a note), read its numbers (features, bbox,
 * centre), draw it on the landscape, fly to it, and switch the view between
 * the plane and the plan (straight down).
 */
import type { ToolModule } from './index';
import { html, glyph, icon, field, type IconName } from '../kit';
import { densify } from '../world';
import { flatten } from './geo';
import { notePicker, row } from './common';

let lastText = ''; // survives closing the tool (the layer stays on the map)

const mod: ToolModule = {
  mount(root, host) {
    root.classList.add('tl', 'tl-gis');
    const w = host.world;
    const bar = row(root);
    const src = field(root, 6);
    src.setAttribute('aria-label', 'geojson');
    src.value = lastText;
    notePicker(bar, host.notes, ['text'], (n) => {
      src.value = n.text ?? '';
      parse();
    });
    const drawBtn = glyph(bar, 'eye', 'draw', () => {
      if (w.has('gis')) w.drop('gis');
      else draw();
      sync();
    });
    const flyBtn = glyph(bar, 'crosshair', 'fly', () => {
      const f = cur();
      if (f?.centre) w.host.flyToLonLat(f.centre[0], f.centre[1]);
    });
    const planBtn = glyph(bar, 'map-trifold', 'plan', () => {
      w.host.setPlan(!w.host.isPlan());
      sync();
    });
    const info = html('dl', { class: 'tl-info' }, root);

    const cur = () => {
      try {
        const f = flatten(JSON.parse(src.value));
        return f.valid ? f : null;
      } catch {
        return null;
      }
    };
    function parse(): void {
      lastText = src.value;
      info.replaceChildren();
      const f = cur();
      const put = (k: IconName, v: string) => {
        html('dt', {}, info).appendChild(icon(k));
        html('dd', {}, info, v);
      };
      if (!f) {
        let json = true;
        try {
          JSON.parse(src.value);
        } catch {
          json = false;
        }
        // ⚠ GeoJSON: valid JSON that is not GeoJSON · ⚠ { }: not even JSON
        if (src.value.trim()) put('warning', json ? 'GeoJSON' : '{ }');
        sync();
        return;
      }
      put('check-circle', 'GeoJSON');
      put('hash', `${f.features} · ${f.lines.length}⁄ · ${f.points.length}•`);
      if (f.bbox) put('bounding-box', f.bbox.map((v) => v.toFixed(5)).join('  '));
      if (f.centre) put('crosshair', `${f.centre[1].toFixed(5)}  ${f.centre[0].toFixed(5)}`);
      if (w.has('gis')) draw();
      sync();
    }
    function draw(): void {
      const f = cur();
      if (!f) return;
      const l = w.layer('gis');
      l.clear();
      for (const line of f.lines) l.lines.push({ coords: densify(line, 300), cls: 'wl-gis' });
      for (const p of f.points) l.points.push({ lon: p[0], lat: p[1], cls: 'wp-gis' });
    }
    function sync(): void {
      const ok = !!cur();
      drawBtn.disabled = flyBtn.disabled = !ok;
      drawBtn.classList.toggle('on', w.has('gis'));
      planBtn.classList.toggle('on', w.host.isPlan());
    }
    src.addEventListener('input', parse);
    parse();
    return { destroy() {} };
  },
};
export default mod;

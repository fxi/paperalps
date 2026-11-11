/**
 * The 50 summits of the game. Their order is not here: the chain is sealed
 * (see chain.ts), each step revealed by the answer of the previous one.
 *
 * Ids are stable slugs (puzzles and saves refer to them); `name` must match
 * peaks.json exactly and `lat`/`lon` disambiguate homonyms.
 */
import type { Peak } from '../ui/peaks';

export interface Summit {
  id: string;
  name: string; // exact peaks.json name
  lat: number;
  lon: number;
}

const S = (id: string, name: string, lat: number, lon: number): Summit => ({ id, name, lat, lon });

export const SUMMITS: Summit[] = [
  S('matterhorn', 'Matterhorn', 45.97643, 7.6586),
  S('dufourspitze', 'Dufourspitze', 45.93692, 7.86676),
  S('dom', 'Dom', 46.09391, 7.85887),
  S('weisshorn', 'Weisshorn', 46.10125, 7.71607),
  S('dent-blanche', 'Dent Blanche', 46.03418, 7.61193),
  S('ober-gabelhorn', 'Ober Gabelhorn', 46.0386, 7.66804),
  S('zinalrothorn', 'Zinalrothorn', 46.06483, 7.69012),
  S('mont-blanc', 'Mont Blanc / Monte Bianco', 45.83271, 6.86517),
  S('grandes-jorasses', 'Grandes Jorasses / Pointe Walker', 45.86816, 6.98898),
  S('aiguille-verte', 'Aiguille Verte', 45.93459, 6.97002),
  S('aiguille-du-midi', 'Aiguille du Midi', 45.87864, 6.88735),
  S('dent-du-geant', 'Dent du Géant / Pointe Graham', 45.8619, 6.9519),
  S('tour-ronde', 'La Tour Ronde', 45.844, 6.90753),
  S('grand-combin', 'Grand Combin de Grafeneire', 45.93758, 7.29922),
  S('eiger', 'Eiger', 46.57763, 8.00547),
  S('moench', 'Mönch', 46.55851, 7.99727),
  S('jungfrau', 'Jungfrau', 46.53677, 7.96259),
  S('finsteraarhorn', 'Finsteraarhorn', 46.53735, 8.12611),
  S('aletschhorn', 'Aletschhorn', 46.4652, 7.99321),
  S('schreckhorn', 'Schreckhorn', 46.58989, 8.11814),
  S('bietschhorn', 'Bietschhorn', 46.39157, 7.85082),
  S('barre-des-ecrins', 'Barre des Écrins', 44.92216, 6.35955),
  S('meije', 'Grand Pic de la Meije', 45.00483, 6.30843),
  S('gran-paradiso', 'Gran Paradiso', 45.51782, 7.2672),
  S('monviso', 'Monviso', 44.66744, 7.08999),
  S('grande-casse', 'La Grande Casse', 45.40514, 6.82756),
  S('mont-pourri', 'Mont Pourri', 45.52812, 6.8601),
  S('argentera', 'Cima Sud Argentera', 44.17772, 7.3054),
  S('piz-bernina', 'Piz Bernina', 46.38243, 9.90805),
  S('toedi', 'Tödi', 46.81115, 8.91486),
  S('titlis', 'Titlis', 46.77203, 8.43781),
  S('saentis', 'Säntis', 47.24944, 9.34324),
  S('ortler', 'Ortler - Ortles', 46.5091, 10.54493),
  S('koenigspitze', 'Königspitze - Gran Zebrù', 46.4787, 10.56849),
  S('disgrazia', 'Monte Disgrazia', 46.26954, 9.74962),
  S('cima-grande', 'Cima Grande - Große Zinne', 46.61944, 12.30254),
  S('civetta', 'Monte Civetta', 46.38013, 12.05335),
  S('antelao', 'Antelao', 46.45189, 12.2618),
  S('langkofel', 'Saslonch - Langkofel - Sassolungo', 46.52494, 11.73531),
  S('piz-boe', 'Piz Boè', 46.50892, 11.8283),
  S('tofana', 'Tofana di Mezzo', 46.55099, 12.06549),
  S('pelmo', 'Monte Pelmo', 46.41998, 12.13473),
  S('grossglockner', 'Großglockner', 47.07455, 12.69388),
  S('grossvenediger', 'Großvenediger', 47.10927, 12.34534),
  S('wildspitze', 'Wildspitze', 46.88524, 10.86728),
  S('similaun', 'Similaun', 46.76368, 10.88065),
  S('zugspitze', 'Zugspitze', 47.42121, 10.9863),
  S('watzmann', 'Watzmann-Mittelspitze', 47.55439, 12.92203),
  S('dachstein', 'Hoher Dachstein', 47.47519, 13.60567),
  S('triglav', 'Triglav', 46.3783, 13.83658),
];

export const summitById = new Map(SUMMITS.map((s) => [s.id, s]));

/** Match each summit to its peak (same name, within ~500 m). Missing ones are skipped. */
export function resolveSummits(peaks: Peak[]): Map<string, Peak> {
  const out = new Map<string, Peak>();
  for (const s of SUMMITS) {
    let best: Peak | null = null;
    let bestD = Infinity;
    for (const p of peaks) {
      if (p.name !== s.name) continue;
      const d = Math.hypot(p.lat - s.lat, (p.lon - s.lon) * Math.cos((s.lat * Math.PI) / 180)) * 111000;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD < 500) out.set(s.id, best);
  }
  return out;
}

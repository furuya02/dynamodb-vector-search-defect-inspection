// 検証B: 同じ埋め込みで EUCLIDEAN と COSINE のスコア・順位を比べる（evaluate.ts の結果を使う）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './common.js';

const load = (s: string) => JSON.parse(readFileSync(join(DATA_DIR, '..', `result-${s}.json`), 'utf8'));
const e = load('euclid-1024');
const c = load('cosine-1024');

let maxDiff = 0;
const rows = e.rows.map((r: any, i: number) => {
  const cos = c.rows[i].score;
  // EUCLIDEAN^2 / 2 と COSINE距離の差を確認する
  maxDiff = Math.max(maxDiff, Math.abs(r.score ** 2 - 2 * cos));
  return { id: r.id, euclid: r.score.toFixed(5), cosine: cos.toFixed(5), 'euclid^2/2': (r.score ** 2 / 2).toFixed(5), sameNearest: r.nearest === c.rows[i].nearest };
});
console.table(rows);
const rank = (rs: any[]) => [...rs].sort((a, b) => b.score - a.score).map((r) => r.id).join(',');
console.log({ maxAbsDiff: maxDiff, sameRanking: rank(e.rows) === rank(c.rows), euclid: e.summary, cosine: c.summary });

// しきい値を良品記録の leave-one-out で決め、test_ok / test_ng を判定する
// 使い方: pnpm tsx evaluate.ts [index] [same]   (same: 同じ照明の良品記録だけと比較)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScanCommand, SearchVectorsCommand } from '@aws-sdk/client-dynamodb';
import { DATA_DIR, ddb, embedCached, listImages, TABLE, vectorAttr } from './common.js';

const [index = 'euclid-1024', mode] = process.argv.slice(2);
const same = mode === 'same';
const dim = Number(index.split('-')[1]);

// 最も近い良品記録（自分自身は除く）のスコアを返す
async function nearest(vec: number[], lighting: string, selfPk?: string) {
  const res = await ddb.send(new SearchVectorsCommand({
    TableName: TABLE,
    IndexName: index,
    SearchVector: vec.map((n) => ({ N: String(n) })),
    TopK: 2,
    SearchConditionExpression: `product = :p AND verdict = :ok${same ? ' AND lighting = :l' : ''}`,
    ExpressionAttributeValues: { ':p': { S: 'duck' }, ':ok': { S: 'OK' }, ...(same ? { ':l': { S: lighting } } : {}) },
  }));
  const hit = res.SearchResults!.find((r) => r.Item!.pk.S !== selfPk)!;
  return { score: hit.Score!, nearest: hit.Item!.pk.S! };
}

// 1. 良品記録の leave-one-out スコア → しきい値（良品記録の最大値）
const { Items } = await ddb.send(new ScanCommand({ TableName: TABLE, ProjectionExpression: `pk, lighting, ${vectorAttr(dim)}` }));
const loo = await Promise.all(Items!.map(async (it) =>
  (await nearest(it[vectorAttr(dim)].L!.map((v) => Number(v.N)), it.lighting.S!, it.pk.S)).score));
const mean = loo.reduce((a, b) => a + b, 0) / loo.length;
const sd = Math.sqrt(loo.reduce((a, b) => a + (b - mean) ** 2, 0) / loo.length);
const threshold = Math.max(...loo);

// 2. 新しい検査画像を判定
const rows = [];
for (const img of [...listImages('test_ok'), ...listImages('test_ng')]) {
  const r = await nearest(await embedCached(img, dim), img.lighting);
  rows.push({ id: img.id, group: img.group, lighting: img.lighting, ...r, flagged: r.score > threshold });
}

const ok = rows.filter((r) => r.group === 'test_ok');
const ng = rows.filter((r) => r.group.startsWith('test_ng'));
const window = (Math.min(...ng.map((r) => r.score)) - Math.max(...ok.map((r) => r.score))) / sd;
const summary = {
  index, sameLighting: same, threshold, looMean: mean, looSd: sd,
  falsePositive: `${ok.filter((r) => r.flagged).length}/${ok.length}`,
  detected: `${ng.filter((r) => r.flagged).length}/${ng.length}`,
  operatingWindowSigma: window,
};
console.table(rows.map(({ id, lighting, score, nearest, flagged }) => ({ id, lighting, score: score.toFixed(4), nearest, flagged })));
console.log(summary);

const suffix = `${index}${same ? '-same' : ''}`;
writeFileSync(join(DATA_DIR, '..', `threshold-${suffix}.json`), JSON.stringify({ threshold }));
writeFileSync(join(DATA_DIR, '..', `result-${suffix}.json`), JSON.stringify({ summary, loo, rows }, null, 2));

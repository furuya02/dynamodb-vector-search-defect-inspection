// 1 枚の検査画像について、最も近い良品記録を SearchVectors で引き、異常スコアと業務データを返す
// 使い方: pnpm tsx inspect.ts <画像パス> [lighting] [index]
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SearchVectorsCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DATA_DIR, ddb, embed, TABLE } from './common.js';

const [path, lighting, index = 'euclid-1024'] = process.argv.slice(2);
const dim = Number(index.split('-')[1]);

const res = await ddb.send(new SearchVectorsCommand({
  TableName: TABLE,
  IndexName: index,
  SearchVector: (await embed(path, dim)).map((n) => ({ N: String(n) })),
  TopK: 3,
  SearchConditionExpression: `product = :p AND verdict = :ok${lighting ? ' AND lighting = :l' : ''}`,
  ExpressionAttributeValues: {
    ':p': { S: 'duck' },
    ':ok': { S: 'OK' },
    ...(lighting ? { ':l': { S: lighting } } : {}),
  },
  ReturnConsumedCapacity: 'TOTAL',
}));

const score = res.SearchResults![0].Score!;
const thFile = join(DATA_DIR, '..', `threshold-${index}${lighting ? '-same' : ''}.json`);
const threshold = existsSync(thFile) ? JSON.parse(readFileSync(thFile, 'utf8')).threshold : undefined;
console.log(JSON.stringify({
  image: basename(path),
  anomalyScore: score,
  threshold,
  judgement: threshold === undefined ? '-' : score > threshold ? '要確認' : 'OK',
  nearestOkRecords: res.SearchResults!.map((r) => ({ score: r.Score, ...unmarshall(r.Item!) })),
  consumedCapacity: res.ConsumedCapacity,
}, null, 2));

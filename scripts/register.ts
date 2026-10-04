// 良品画像（train_ok）を「過去の良品検査記録」として登録する。原本は S3、ベクトル＋業務データは DynamoDB
import { readFileSync } from 'node:fs';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ddb, DIMS, embedCached, listImages, TABLE, toList, vectorAttr } from './common.js';

const bucket = process.env.BUCKET_NAME!;
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
const INSPECTORS = ['inspector-a', 'inspector-b', 'inspector-c'];

for (const img of listImages('train_ok')) {
  const no = Number(img.id.slice(-2)); // 個体番号
  const imageKey = `train_ok/${img.lighting}/${img.id}.png`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: imageKey, Body: readFileSync(img.path) }));

  const vectors = Object.fromEntries(
    await Promise.all(DIMS.map(async (d) => [vectorAttr(d), toList(await embedCached(img, d))])),
  );
  await ddb.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      pk: { S: `INS-${img.id}` },
      product: { S: 'duck' },          // ベクトルインデックスの HASH
      verdict: { S: 'OK' },            // INLINE_FILTER
      lighting: { S: img.lighting },   // INLINE_FILTER（検査台ごとの照明）
      lot: { S: `LOT-2609-${String(no).padStart(2, '0')}` },
      inspectedAt: { S: `2026-09-${String(no).padStart(2, '0')}T10:00:00+09:00` },
      inspector: { S: INSPECTORS[no % 3] },
      imageKey: { S: imageKey },
      ...vectors,
    },
  }));
  console.log(`registered ${img.id}`);
}

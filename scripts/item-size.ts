// 検証A: 次元数ごとのアイテムサイズを実測する
// 同じベクトルを「普通の属性（v）」と「ベクトルインデックスの属性（embedding 等）」に入れて比べる
// WCU は 1KB 単位なので、パディング文字列を足して WCU が 1 増える境目を二分探索し、バイト数を求める
import { DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, DIMS, embedCached, listImages, TABLE, toList, vectorAttr } from './common.js';

async function wcu(item: any) {
  const r = await ddb.send(new PutItemCommand({ TableName: TABLE, Item: item, ReturnConsumedCapacity: 'TOTAL' }));
  await ddb.send(new DeleteItemCommand({ TableName: TABLE, Key: { pk: item.pk } }));
  return r.ConsumedCapacity!.CapacityUnits!;
}

const img = listImages('train_ok')[0];
for (const dim of DIMS) {
  for (const attr of ['v', vectorAttr(dim)]) {
    const base = { pk: { S: 'P' }, [attr]: toList(await embedCached(img, dim)) };
    const w0 = await wcu(base);
    let lo = 0, hi = 1024;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      (await wcu({ ...base, x: { S: 'a'.repeat(m) } })) > w0 ? (hi = m) : (lo = m + 1);
    }
    const bytes = w0 * 1024 - lo; // 境目: bytes + 1(属性名 x) + lo = w0*1024 + 1
    console.log({ dim, attr, wcu: w0, itemBytes: bytes, bytesPerDim: (bytes / dim).toFixed(2), ofItemLimit: `${((bytes / 409600) * 100).toFixed(2)}%` });
  }
}

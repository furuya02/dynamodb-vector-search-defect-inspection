import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const PROJECT = 'dynamodb-vector-search-defect-inspection';
export const TABLE = PROJECT;
export const DATA_DIR = join(import.meta.dirname, '..', 'data', 'duck');
export const DIMS = [1024, 384, 256] as const;
export const MODEL_ID = 'amazon.titan-embed-image-v1';

// DynamoDB は東京、Titan Multimodal Embeddings は東京に無いため us-east-1
export const ddb = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

export const vectorAttr = (dim: number) => (dim === 1024 ? 'embedding' : `embedding${dim}`);

export async function embed(path: string, dim: number): Promise<number[]> {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    body: JSON.stringify({
      inputImage: readFileSync(path).toString('base64'),
      embeddingConfig: { outputEmbeddingLength: dim },
    }),
  }));
  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
}

export type Image = { path: string; id: string; lighting: string; group: string };

// train_ok/normal/ok_normal_01.png → { id: 'ok_normal_01', lighting: 'normal', group: 'train_ok' }
export function listImages(group: 'train_ok' | 'test_ok' | 'test_ng'): Image[] {
  const dir = join(DATA_DIR, group);
  return readdirSync(dir).flatMap((sub) =>
    readdirSync(join(dir, sub)).filter((f) => f.endsWith('.png')).sort().map((f) => ({
      path: join(dir, sub, f),
      id: basename(f, '.png'),
      // test_ng のサブフォルダは難易度。照明は未記録だが、背景の左右上端の明るさが同等なため bright とみなす
      lighting: group === 'test_ng' ? 'bright' : sub,
      group: group === 'test_ng' ? `${group}/${sub}` : group,
    })),
  );
}

export const toList = (v: number[]) => ({ L: v.map((n) => ({ N: String(n) })) });

// 同じ画像を何度も Bedrock に投げないよう、次元ごとに data/embeddings-<dim>.json へキャッシュ
export async function embedCached(img: Image, dim: number): Promise<number[]> {
  const file = join(DATA_DIR, '..', `embeddings-${dim}.json`);
  const cache: Record<string, number[]> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (!cache[img.id]) {
    cache[img.id] = await embed(img.path, dim);
    writeFileSync(file, JSON.stringify(cache));
  }
  return cache[img.id];
}

# dynamodb-vector-search-defect-inspection

Amazon DynamoDB のネイティブベクトル検索（`SearchVectors`）を使い、外観検査の「良品の検査記録」から遠い画像を「要確認」として検出するサンプルです。
ベクトル（Amazon Titan Multimodal Embeddings）と検査記録（ロット・検査日時・担当・照明・画像キー）を同じアイテムに置き、1 回の検索で異常スコアと根拠となった良品記録を返します。

## 概要

外観検査では、不良の種類をあらかじめ網羅できないことがあります。このサンプルでは、良品の検査記録（画像ベクトル + 業務データ）だけを DynamoDB に登録し、新しい画像の最近傍の良品記録までの距離が、良品記録の leave-one-out で決めたしきい値を超えたら「要確認」とします。

## 特徴

- 1 回の `SearchVectors` で、異常スコアと最近傍の良品記録（業務データ付き）を返す
- インラインフィルタ（`verdict`・`lighting`）で、良品記録だけ・同じ照明の記録だけに絞って検索
- ベクトルインデックスは CDK（`CfnTable` のプロパティオーバーライド）でテーブル作成時に 4 本作成
- 次元数（1024 / 384 / 256）、アイテムサイズ、EUCLIDEAN と COSINE を比較するスクリプト付き

## 構成

- DynamoDB（オンデマンド）: 検査記録 + ベクトル。ベクトルインデックス 4 本（euclid-1024 / cosine-1024 / euclid-384 / euclid-256）
- S3: 原本画像
- Bedrock（us-east-1）: `amazon.titan-embed-image-v1`（東京リージョンには無いため）

> 2026-10 時点で、CloudFormation リファレンスと CDK L2 にベクトルインデックスの記載が無いため、`CfnTable` の `addPropertyOverride` で `VectorIndexes` を指定しています。

## 動作確認した環境（2026-10-05）

| 項目 | バージョン |
|---|---|
| Node.js | 22.14.0 |
| pnpm | 10.24.0 |
| aws-cdk-lib / aws-cdk | 2.272.0 / 2.1144.0 |
| @aws-sdk/client-dynamodb | 3.1146.0 |
| リージョン | ap-northeast-1（Bedrock のみ us-east-1） |

## 構築手順

```bash
git clone https://github.com/furuya02/dynamodb-vector-search-defect-inspection.git
cd dynamodb-vector-search-defect-inspection

# CDK デプロイ（バケット名のサフィックスは既定でアカウント ID。-c bucket_suffix=xxx で上書き可）
cd cdk
pnpm install
pnpm exec cdk bootstrap   # 未実施の場合のみ
pnpm exec cdk deploy
cd ..
```

Bedrock のモデルアクセスで、us-east-1 の Amazon Titan Multimodal Embeddings G1 を有効にしておいてください。

## 動作確認手順

```bash
cd scripts
pnpm install

# 1. データセット（Duck Visual Inspection Dataset / CC BY 4.0）を ../data/duck に取得
./download-dataset.sh

# 2. 良品画像（train_ok 27 枚）を「過去の良品検査記録」として登録
BUCKET_NAME=dynamodb-vector-search-defect-inspection-<ACCOUNT_ID> pnpm exec tsx register.ts

# 3. しきい値を決めて、test_ok（30 枚）と test_ng（10 枚）を判定
pnpm exec tsx evaluate.ts euclid-1024          # 照明フィルタ無し
pnpm exec tsx evaluate.ts euclid-1024 same     # 同じ照明の良品記録だけと比較

# 4. 1 枚を検査（異常スコア + 最も近い良品記録を表示）
pnpm exec tsx inspect.ts ../data/duck/test_ng/hard/ng_hard_18.png

# 検証A: 次元数とアイテムサイズ / 検証B: EUCLIDEAN と COSINE
pnpm exec tsx evaluate.ts euclid-384
pnpm exec tsx evaluate.ts euclid-256
pnpm exec tsx item-size.ts
pnpm exec tsx evaluate.ts cosine-1024
pnpm exec tsx verify-distance.ts
```

## クリーンアップ

DynamoDB（オンデマンド）と S3 は、置いておくだけでもストレージ料金がかかります。確認が終わったら削除してください。

```bash
cd cdk
pnpm exec cdk destroy
```

S3 の自動削除用 Lambda のロググループ（`/aws/lambda/DynamoDbVectorSearchDefec-CustomS3AutoDeleteObject-*`）が残る場合は、あわせて削除してください。

## データセット

Shinichi Hirauchi, "Duck Visual Inspection Dataset", 2026.
https://github.com/furuya02/sagemaker-embedding-ft-visual-inspection
Licensed under CC BY 4.0.

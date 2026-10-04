# dynamodb-vector-search-defect-inspection

A sample that uses Amazon DynamoDB native vector search (`SearchVectors`) to flag visual-inspection images that are far from past "good product" inspection records.
Vectors (Amazon Titan Multimodal Embeddings) and inspection records (lot, inspected time, inspector, lighting, image key) live in the same item, so a single search returns both the anomaly score and the good-product records it was compared with.

## Overview

Visual inspection often cannot enumerate every defect type in advance. This sample registers only good-product inspection records (image vector + business data) in DynamoDB, and flags a new image as "needs review" when its nearest good record is farther than a threshold decided by leave-one-out on the good records.

## Features

- One `SearchVectors` call returns the anomaly score and the nearest good-product records with their business attributes
- Inline filters (`verdict`, `lighting`) restrict the search to good records / the same lighting condition
- Vector indexes are created with CDK (`CfnTable` property override), 4 indexes at table creation
- Scripts to compare dimensions (1024 / 384 / 256), item size, and EUCLIDEAN vs COSINE

## Architecture

- DynamoDB (on-demand): inspection records + vectors, with 4 vector indexes (euclid-1024 / cosine-1024 / euclid-384 / euclid-256)
- S3: original images
- Bedrock (us-east-1): `amazon.titan-embed-image-v1` (not available in Tokyo)

> As of 2026-10, neither the CloudFormation reference nor the CDK L2 construct documents vector indexes, so `VectorIndexes` is set via `addPropertyOverride` on `CfnTable`.

## Tested environment (2026-10-05)

| Item | Version |
|---|---|
| Node.js | 22.14.0 |
| pnpm | 10.24.0 |
| aws-cdk-lib / aws-cdk | 2.272.0 / 2.1144.0 |
| @aws-sdk/client-dynamodb | 3.1146.0 |
| Region | ap-northeast-1 (Bedrock only: us-east-1) |

## Setup

```bash
git clone https://github.com/furuya02/dynamodb-vector-search-defect-inspection.git
cd dynamodb-vector-search-defect-inspection

# CDK deploy (bucket suffix defaults to the account ID; override with -c bucket_suffix=xxx)
cd cdk
pnpm install
pnpm exec cdk bootstrap   # only if not bootstrapped yet
pnpm exec cdk deploy
cd ..
```

Enable model access for Amazon Titan Multimodal Embeddings G1 in us-east-1.

## Try it

```bash
cd scripts
pnpm install

# 1. Download the dataset (Duck Visual Inspection Dataset / CC BY 4.0) into ../data/duck
./download-dataset.sh

# 2. Register good-product images (train_ok, 27 images) as past inspection records
BUCKET_NAME=dynamodb-vector-search-defect-inspection-<ACCOUNT_ID> pnpm exec tsx register.ts

# 3. Decide the threshold and judge test_ok (30) and test_ng (10)
pnpm exec tsx evaluate.ts euclid-1024          # no lighting filter
pnpm exec tsx evaluate.ts euclid-1024 same     # compare only with records under the same lighting

# 4. Inspect one image (anomaly score + nearest good-product records)
pnpm exec tsx inspect.ts ../data/duck/test_ng/hard/ng_hard_18.png

# Verification A: dimensions and item size / Verification B: EUCLIDEAN vs COSINE
pnpm exec tsx evaluate.ts euclid-384
pnpm exec tsx evaluate.ts euclid-256
pnpm exec tsx item-size.ts
pnpm exec tsx evaluate.ts cosine-1024
pnpm exec tsx verify-distance.ts
```

## Cleanup

DynamoDB (on-demand) and S3 incur storage charges even when idle. Delete the stack when you are done.

```bash
cd cdk
pnpm exec cdk destroy
```

If the log groups of the S3 auto-delete Lambda (`/aws/lambda/DynamoDbVectorSearchDefec-CustomS3AutoDeleteObject-*`) remain, delete them as well.

## Dataset

Shinichi Hirauchi, "Duck Visual Inspection Dataset", 2026.
https://github.com/furuya02/sagemaker-embedding-ft-visual-inspection
Licensed under CC BY 4.0.

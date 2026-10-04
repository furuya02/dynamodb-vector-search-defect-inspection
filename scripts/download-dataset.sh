#!/bin/bash
# アヒル画像データセット（CC BY 4.0）を ../data/duck に取得する
set -e
cd "$(dirname "$0")/.."
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/furuya02/sagemaker-embedding-ft-visual-inspection data/src
git -C data/src sparse-checkout set data/duck
mv data/src/data/duck data/duck && rm -rf data/src
find data/duck -name '*.png' | wc -l

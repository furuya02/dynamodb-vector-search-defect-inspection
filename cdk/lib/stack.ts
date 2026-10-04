import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, CfnTable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

const PROJECT = 'dynamodb-vector-search-defect-inspection';

// 検証用に 4 本作る（同じベクトル属性を参照するインデックスは次元数をそろえる必要があるため、次元ごとに属性を分ける）
const VECTOR_INDEXES = [
  { name: 'euclid-1024', attr: 'embedding', dim: 1024, fn: 'EUCLIDEAN' },
  { name: 'cosine-1024', attr: 'embedding', dim: 1024, fn: 'COSINE' },
  { name: 'euclid-384', attr: 'embedding384', dim: 384, fn: 'EUCLIDEAN' },
  { name: 'euclid-256', attr: 'embedding256', dim: 256, fn: 'EUCLIDEAN' },
];

export class DefectInspectionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const suffix = this.node.tryGetContext('bucket_suffix') ?? this.account;

    // 原本画像
    const bucket = new Bucket(this, 'ImageBucket', {
      bucketName: `${PROJECT}-${suffix}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 検査記録（ベクトル + 業務データ）。ベクトルインデックスはオンデマンド必須
    const table = new Table(this, 'InspectionTable', {
      tableName: PROJECT,
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 2026-10 時点で CDK L2 / CloudFormation リファレンスに VectorIndexes が無いため L1 に直接書く
    const cfn = table.node.defaultChild as CfnTable;
    // SearchSchema で参照する属性は AttributeDefinitions に定義が必要
    ['product', 'verdict', 'lighting'].forEach((name, i) =>
      cfn.addPropertyOverride(`AttributeDefinitions.${i + 1}`, { AttributeName: name, AttributeType: 'S' }));
    cfn.addPropertyOverride('VectorIndexes', VECTOR_INDEXES.map((v) => ({
      IndexName: v.name,
      VectorAttribute: { AttributeName: v.attr },
      Dimensions: v.dim,
      DistanceFunction: v.fn,
      SearchSchema: [
        { AttributeName: 'product', SearchSchemaElementType: 'HASH' },         // 品種
        { AttributeName: 'verdict', SearchSchemaElementType: 'INLINE_FILTER' }, // 判定 OK/NG
        { AttributeName: 'lighting', SearchSchemaElementType: 'INLINE_FILTER' },// 照明（検査台）
      ],
      Projection: { ProjectionType: 'INCLUDE', NonKeyAttributes: ['lot', 'inspectedAt', 'inspector', 'imageKey'] },
    })));

    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}

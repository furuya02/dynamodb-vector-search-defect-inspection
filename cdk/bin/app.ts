import { App } from 'aws-cdk-lib';
import { DefectInspectionStack } from '../lib/stack';

const app = new App();
new DefectInspectionStack(app, 'DynamoDbVectorSearchDefectInspection', {
  env: { region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1' },
});

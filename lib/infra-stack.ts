import { Stack, CfnOutput, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { SharedConfig } from "./config";

export interface InfrastructureStackProps extends StackProps {
  config: SharedConfig;
}

export class InfrastructureStack extends Stack {
  public readonly table: dynamodb.TableV2;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create DynamoDB table
    this.table = new dynamodb.TableV2(
      this,
      `${config.projectName}-${config.stage}-primary-table`,
      {
        tableName: `${config.projectName}-${config.stage}-primary`,
        partitionKey: {
          name: "pk",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "sk",
          type: dynamodb.AttributeType.STRING,
        },
        localSecondaryIndexes: [
          {
            indexName: "lsi",
            sortKey: { name: "lsi", type: dynamodb.AttributeType.STRING },
          },
        ],
        removalPolicy:
          config.stage === "prod"
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY,
      },
    );

    // Create S3 bucket
    this.bucket = new s3.Bucket(
      this,
      `${config.projectName}-${config.stage}-bucket`,
      {
        enforceSSL: true,
        removalPolicy:
          config.stage === "prod"
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY,
        minimumTLSVersion: 1.2,
        publicReadAccess: true,
        cors: [
          {
            allowedHeaders: ["*"],
            allowedOrigins: [
              "http://localhost:3000",
              `https://${config.frontendDomainName}`,
            ],
            allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
            maxAge: 300,
          },
        ],
        blockPublicAccess: {
          blockPublicAcls: false,
          blockPublicPolicy: false,
          ignorePublicAcls: false,
          restrictPublicBuckets: false,
        },
      },
    );

    // Outputs
    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
  }
}

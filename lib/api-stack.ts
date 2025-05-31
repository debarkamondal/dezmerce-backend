import { Stack, CfnOutput, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { SharedConfig } from "./config";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { ApiLambdaConstructor } from "./constructs/lambda-constructor";

export interface ApiStackProps extends StackProps {
  config: SharedConfig;
  table: dynamodb.TableV2;
  bucket: s3.Bucket;
}
type lambda = {
  name: string;
  entry: string;
  route: string;
  methods: apigw2.HttpMethod[];
  environment?:
    | {
        [key: string]: string;
      }
    | undefined;
  permissions?: {
    db?: "RW" | "R" | "W";
    s3?: "RW" | "R" | "W";
  };
  authorizer?: HttpLambdaAuthorizer;
};

export class ApiStack extends Stack {
  public readonly httpApi: apigw2.HttpApi;
  public readonly adminAuthorizer: HttpLambdaAuthorizer;
  public readonly userAuthorizer: HttpLambdaAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, table, bucket } = props;

    // Create custom domain
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      `${config.domainName}-certificate`,
      config.certArn,
    );

    const customDomain = new apigw2.DomainName(this, config.domainName, {
      domainName: config.domainName,
      certificate,
    });

    // Create HTTP API
    this.httpApi = new apigw2.HttpApi(
      this,
      `${config.projectName}-${config.stage}-api`,
      {
        defaultDomainMapping: {
          domainName: customDomain,
          mappingKey: config.stage,
        },
        corsPreflight: {
          allowOrigins: ["http://localhost:3000", "https://www.dkmondal.in"],
          allowMethods: [apigw2.CorsHttpMethod.GET],
        },
      },
    );

    // Create admin authorizer
    const adminAuthFn = new NodejsFunction(
      this,
      `${config.projectName}-${config.stage}-admin-authorizer-lambda`,
      {
        functionName: `${config.projectName}-${config.stage}-admin-authorizer-lambda`,
        entry: "lambda/admin/authorizer.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          JWTSecret: config.JWTSecret,
        },
      },
    );

    this.adminAuthorizer = new HttpLambdaAuthorizer(
      `${config.projectName}-${config.stage}-admin-authorizer`,
      adminAuthFn,
      {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
      },
    );

    //Create user authorizer
    const userAuthFn = new NodejsFunction(
      this,
      `${config.projectName}-user-authorizer`,
      {
        entry: "lambda/user/authorizer.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          JWTSecret: config.JWTSecret,
        },
      },
    );
    this.userAuthorizer = new HttpLambdaAuthorizer(
      `${config.projectName}-user-authorizer`,
      userAuthFn,
      {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
      },
    );

    // Define admin lambdas
    const adminLambdas: lambda[] = [
      {
        name: "admin-products",
        entry: "lambda/admin/products.ts",
        route: "/admin/products",
        methods: [
          apigw2.HttpMethod.DELETE,
          apigw2.HttpMethod.PATCH,
          apigw2.HttpMethod.POST,
        ],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
          BUCKET_NAME: bucket.bucketName,
          REGION: config.region,
        },
        permissions: {
          db: "RW" as const,
          s3: "W" as const,
        },
        authorizer: this.adminAuthorizer,
      },
      {
        name: "admin-cancel-order",
        entry: "lambda/admin/orders.ts",
        route: "/admin/orders/cancel/{:orderId}",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
          PAYMENT_GW_KEY_SECRET: config.pgSecret,
          PAYMENT_GW_KEY_ID: config.pgId,
        },
        permissions: {
          db: "RW" as const,
        },
        authorizer: this.adminAuthorizer,
      },
      {
        name: "admin-ship-order",
        entry: "lambda/admin/orders.ts",
        route: "/admin/orders/ship/{:orderId}",
        methods: [apigw2.HttpMethod.POST],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "W" as const,
        },
        authorizer: this.adminAuthorizer,
      },
      {
        name: "admin-orders",
        entry: "lambda/admin/orders.ts",
        route: "/admin/orders",
        methods: [apigw2.HttpMethod.GET],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "R" as const,
        },
        authorizer: this.adminAuthorizer,
      },
      {
        name: "admin-categories",
        entry: "lambda/admin/categories.ts",
        route: "/admin/categories",
        methods: [apigw2.HttpMethod.POST, apigw2.HttpMethod.PATCH],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
          BUCKET_NAME: bucket.bucketName,
        },
        permissions: {
          db: "RW" as const,
          s3: "W" as const,
        },
        authorizer: this.adminAuthorizer,
      },
    ];

    const publicLambdas: lambda[] = [
      {
        name: "signin",
        entry: "lambda/signin.ts",
        route: "/signin",
        environment: {
          JWTSecret: config.JWTSecret,
          DB_TABLE_NAME: props.table.tableName,
        },
        methods: [apigw2.HttpMethod.POST],
        permissions: {
          db: "RW" as const,
        },
      },
      {
        name: "public-payments",
        entry: "lambda/public/payments.ts",
        route: "/payments",
        methods: [apigw2.HttpMethod.POST, apigw2.HttpMethod.GET],
        environment: {
          PAYMENT_GW_KEY_SECRET: config.pgSecret,
          PAYMENT_GW_KEY_ID: config.pgId,
          DB_TABLE_NAME: props.table.tableName,
          JWTSecret: config.JWTSecret,
        },
        permissions: {
          db: "RW" as const,
        },
      },
      {
        name: "public-order",
        entry: "lambda/public/orders.ts",
        route: "/orders",
        methods: [apigw2.HttpMethod.POST, apigw2.HttpMethod.GET],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
          JWTSecret: config.JWTSecret,
        },
        permissions: {
          db: "RW" as const,
        },
      },
      {
        name: "get-categories",
        entry: "lambda/public/categories.ts",
        route: "/categories",
        methods: [apigw2.HttpMethod.GET],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "R" as const,
        },
      },
      {
        name: "get-category-products",
        entry: "lambda/public/categories.ts",
        route: "/categories/{:category}",
        methods: [apigw2.HttpMethod.GET],
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "R" as const,
        },
      },
      {
        name: "get-product",
        entry: "lambda/public/product.ts",
        route: "/product/{:id}",
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "R" as const,
        },
        methods: [apigw2.HttpMethod.GET],
      },
      {
        name: "get-cart-value",
        entry: "lambda/public/cart.ts",
        route: "/cart",
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "R" as const,
        },
        methods: [apigw2.HttpMethod.PUT],
      },
    ];
    //Define user lambdas
    const userLambdas: lambda[] = [
      {
        name: "cart",
        entry: "lambda/user/cart.ts",
        route: "/user/cart",
        environment: {
          DB_TABLE_NAME: props.table.tableName,
        },
        permissions: {
          db: "RW" as const,
        },
        methods: [apigw2.HttpMethod.GET, apigw2.HttpMethod.POST],
        authorizer: this.userAuthorizer,
      },
    ];

    // Create all admin lambdas
    adminLambdas.forEach((lambdaDef) => {
      new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        table,
        bucket,
        stage: config.stage,
      });
    });

    publicLambdas.forEach((lambdaDef) => {
      new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        table,
        bucket,
        stage: config.stage,
      });
    });
    userLambdas.forEach((lambdaDef) => {
      new ApiLambdaConstructor(this, `${lambdaDef.name}-function`, {
        ...lambdaDef,
        projectName: config.projectName,
        httpApi: this.httpApi,
        table,
        bucket,
        stage: config.stage,
      });
    });
    // Outputs
    new CfnOutput(this, "ApiUrl", { value: this.httpApi.url! });
    new CfnOutput(this, "CNAME", { value: customDomain.regionalDomainName });
    new CfnOutput(this, "ApiDomainUrl", {
      value: `https://${config.domainName}/${config.stage}`,
    });
    new CfnOutput(this, "S3URL", {
      value: props.bucket.bucketRegionalDomainName,
    });
  }
}

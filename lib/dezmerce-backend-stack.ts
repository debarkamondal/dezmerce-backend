import { Stack, CfnOutput, StackProps, aws_s3 as s3 } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as apigw2 from 'aws-cdk-lib/aws-apigatewayv2'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { join } from 'path'

interface MyStackProps extends StackProps {
    domainName: string;
    certArn: string;
    JWTSecret: string;
    stage: string;
    projectName: string;
    dbTableName: string;
    region: string;
}

type lambda = {
    name: string,
    entry: string,
    route: string;
    methods: apigw2.HttpMethod[],
    environment?: {
        [key: string]: string;
    } | undefined,
    permissions?: {
        db?: "RW" | "R" | "W",
        s3?: "RW" | "R" | "W",
    },
    authorizer?: HttpLambdaAuthorizer
}

export class DezmerceBackendStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props)

        const table = new dynamodb.TableV2(this, `${props.projectName}-table`, {
            tableName: props.dbTableName,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            localSecondaryIndexes: [
                {
                    indexName: "lsi",
                    sortKey: { name: 'lsi', type: dynamodb.AttributeType.STRING }
                }
            ]
        })
        const bucket = new s3.Bucket(this, `${props.projectName}-bucket`, {
            enforceSSL: true,
            minimumTLSVersion: 1.2,
            publicReadAccess: true,
            cors: [
                {
                    allowedHeaders: [ "*"],
                    allowedOrigins: ["http://localhost:3000"],
                    allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
                    maxAge: 300,
                }
            ],
            blockPublicAccess: {
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false
            }
        })

        const certificate = acm.Certificate.fromCertificateArn(this, `${props.domainName}-certificate`, props.certArn);
        const customDomain = new apigw2.DomainName(this, props.domainName, {
            domainName: props?.domainName,
            certificate
        })
        const httpApi = new apigw2.HttpApi(this, `${props.projectName}-api`, {
            defaultDomainMapping: {
                domainName: customDomain,
                mappingKey: props.stage,
            },
        })
        const adminLambdas: lambda[] = [{
            name: 'admin-products',
            entry: 'lambda/admin/products.ts',
            route: '/admin/products',
            methods: [apigw2.HttpMethod.DELETE, apigw2.HttpMethod.PATCH, apigw2.HttpMethod.POST],
            environment: {
                DB_TABLE_NAME: props.dbTableName,
                BUCKET_NAME: bucket.bucketName,
                REGION: props.region
            },
            permissions: {
                db: "RW",
                s3: "W"
            }
        }

        ]



        const adminAuthFn = new NodejsFunction(this, `${props.projectName}-admin-authorizer-lambda`, {
            entry: 'lambda/admin/authorizer.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            depsLockFilePath: join(__dirname, "../bun.lock"),
            environment: {
                JWTSecret: props.JWTSecret
            },
        })
        const adminAuthorizer = new HttpLambdaAuthorizer(`${props.projectName}-admin-authorizer`, adminAuthFn, {
            responseTypes: [HttpLambdaResponseType.SIMPLE],
        })

        for (let i = 0; i < adminLambdas.length; i++) {
            const lambdaDef = adminLambdas[i]
            const fn = new NodejsFunction(this, `${props.projectName}-${lambdaDef.name}-lambda`, {
                entry: lambdaDef.entry,
                handler: 'handler',
                runtime: lambda.Runtime.NODEJS_20_X,
                depsLockFilePath: join(__dirname, "../bun.lock"),
                environment: lambdaDef.environment
            })
            const integration = new HttpLambdaIntegration(`${props.projectName}-${lambdaDef.name}-integration`, fn)
            httpApi.addRoutes({
                path: lambdaDef.route,
                methods: lambdaDef.methods,
                integration,
                authorizer: adminAuthorizer
            })
            if (lambdaDef.permissions?.db === "RW") table.grantReadWriteData(fn)
            else if (lambdaDef.permissions?.db === "R") table.grantReadData(fn)
            else if (lambdaDef.permissions?.db === "W") table.grantWriteData(fn)

            if (lambdaDef.permissions?.s3 === "RW") bucket.grantReadWrite(fn)
            else if (lambdaDef.permissions?.s3 === "W") bucket.grantWrite(fn)

        }
        const userAuthFn = new NodejsFunction(this, `${props.projectName}-user-authorizer-lambda`, {
            entry: 'lambda/user/authorizer.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            depsLockFilePath: join(__dirname, "../bun.lock"),
            environment: {
                JWTSecret: props.JWTSecret
            },
        })
        const userAuthorizer = new HttpLambdaAuthorizer(`${props.projectName}-user-authorizer`, userAuthFn, {
            responseTypes: [HttpLambdaResponseType.SIMPLE],
        })

        const userLambdas: lambda[] = [{
            name: 'signin',
            entry: 'lambda/signin.ts',
            route: '/signin',
            environment: {
                JWTSecret: props.JWTSecret,
                DB_TABLE_NAME: props.dbTableName,
            },
            methods: [apigw2.HttpMethod.POST],
            permissions: {
                db: "RW"
            }
        },
        {
            name: 'cart',
            entry: 'lambda/user/cart.ts',
            route: '/cart',
            environment: {
                DB_TABLE_NAME: props.dbTableName,
            },
            permissions: {
                db: 'RW'
            },
            methods: [apigw2.HttpMethod.GET, apigw2.HttpMethod.POST],
            authorizer: userAuthorizer
        },

        ]
        for (let i = 0; i < userLambdas.length; i++) {
            const lambdaDef = userLambdas[i]
            const fn = new NodejsFunction(this, `${props.projectName}-${lambdaDef.name}-lambda`, {
                entry: lambdaDef.entry,
                handler: 'handler',
                runtime: lambda.Runtime.NODEJS_20_X,
                depsLockFilePath: join(__dirname, "../bun.lock"),
                environment: lambdaDef.environment ?? undefined
            })
            const integration = new HttpLambdaIntegration(`${props.projectName}-${lambdaDef.name}-integration`, fn)
            httpApi.addRoutes({
                path: lambdaDef.route,
                methods: lambdaDef.methods,
                integration,
                authorizer: lambdaDef.authorizer ?? undefined
            })

            if (lambdaDef.permissions?.db === "RW") table.grantReadWriteData(fn)
            else if (lambdaDef.permissions?.db === "R") table.grantReadData(fn)
            else if (lambdaDef.permissions?.db === "W") table.grantWriteData(fn)

        }

        new CfnOutput(this, 'DEV_URL', { value: httpApi.url! });
    }
}

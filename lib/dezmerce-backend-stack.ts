import { Stack, CfnOutput, StackProps } from 'aws-cdk-lib'
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
}
export class DezmerceBackendStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props)

        const adminLambdas = [{
            name: 'admin-products',
            entry: 'lambda/admin/products.ts',
            route: '/admin/products',
            methods: [apigw2.HttpMethod.POST],
            environment: {
               DB_TABLE_NAME: props.dbTableName 
            },
            permissions:{
                db: "RW"
            }
        },
        {
            name: 'admin-products-id',
            entry: 'lambda/admin/products.ts',
            route: '/admin/products/{id}',
            methods: [apigw2.HttpMethod.GET, apigw2.HttpMethod.DELETE, apigw2.HttpMethod.PATCH],
            environment: {
               DB_TABLE_NAME: props.dbTableName 
            },
            permissions:{
                db: "RW"
            }
        },

        ]
        const userLambdas = [{
            name: 'signin',
            entry: 'lambda/signin.ts',
            route: '/signin',
            environment: {
                JWTSecret: props.JWTSecret
            },
            methods: [apigw2.HttpMethod.POST]
        },
        ]


        const table= new dynamodb.TableV2(this, `${props.domainName}-table`,{
            tableName: props.dbTableName,
            partitionKey:{
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey:{
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            localSecondaryIndexes:[
                {
                    indexName: "lsi",
                    sortKey:{ name: 'sk', type: dynamodb.AttributeType.STRING}
                }
            ]
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


        const authFn = new NodejsFunction(this, `authorizer-lambda`, {
            entry: 'lambda/authorizer.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            depsLockFilePath: join(__dirname, "../bun.lock"),
            environment: {
                JWTSecret: props.JWTSecret
            },
        })
        const authorizer = new HttpLambdaAuthorizer("admin-lambda-authorizer", authFn, {
            responseTypes: [HttpLambdaResponseType.SIMPLE],
        })


        for (let i = 0; i < adminLambdas.length; i++) {
            const lambdaDef = adminLambdas[i]
            const fn = new NodejsFunction(this, `${lambdaDef.name}-lambda`, {
                entry: lambdaDef.entry,
                handler: 'handler',
                runtime: lambda.Runtime.NODEJS_20_X,
                depsLockFilePath: join(__dirname, "../bun.lock"),
                environment: lambdaDef.environment
            })
            const integration = new HttpLambdaIntegration(`${lambdaDef.name}-integration`, fn)
            httpApi.addRoutes({
                path: lambdaDef.route,
                methods: lambdaDef.methods,
                integration,
                authorizer
            })
           if(lambdaDef.permissions.db==="RW") table.grantReadWriteData(fn) 
           if(lambdaDef.permissions.db==="R") table.grantReadData(fn) 

        }
        for (let i = 0; i < userLambdas.length; i++) {
            const lambdaDef = userLambdas[i]
            const fn = new NodejsFunction(this, `${lambdaDef.name}-lambda`, {
                entry: lambdaDef.entry,
                handler: 'handler',
                runtime: lambda.Runtime.NODEJS_20_X,
                depsLockFilePath: join(__dirname, "../bun.lock"),
                environment: lambdaDef.environment
            })
            const integration = new HttpLambdaIntegration(`${lambdaDef.name}-integration`, fn)
            httpApi.addRoutes({
                path: lambdaDef.route,
                methods: lambdaDef.methods,
                integration,
            })

        }

        new CfnOutput(this, 'DEV_URL', { value: httpApi.url! });
    }
}

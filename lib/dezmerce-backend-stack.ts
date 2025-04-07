import { Stack, CfnOutput, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
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
}
export class DezmerceBackendStack extends Stack {
    constructor(scope: Construct, id: string, props: MyStackProps) {
        super(scope, id, props)
        console.log(props.stage)
        const lambdaDefs = [{
            name: 'signin',
            entry: 'lambda/signin.ts',
            route: '/signin',
            environment: {
                JWTSecret: props.JWTSecret
            },
            methods: [apigw2.HttpMethod.POST]
        },
        {
            name: 'for',
            entry: 'lambda/for.ts',
            route: '/for',
            methods: [apigw2.HttpMethod.GET]
        },
        ]

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
        for (let i = 0; i < lambdaDefs.length; i++) {
            const lambdaDef = lambdaDefs[i]
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
                authorizer: (lambdaDef.route === '/for') ? authorizer : undefined
            })

        }

        new CfnOutput(this, 'DEV_URL', { value: httpApi.url! });
    }
}

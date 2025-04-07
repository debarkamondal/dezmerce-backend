#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DezmerceBackendStack } from '../lib/dezmerce-backend-stack';
import * as dotenv from 'dotenv';
import * as path from 'path';

const app = new cdk.App();
dotenv.config({ path: path.join(__dirname, '..', '.env') });
new DezmerceBackendStack(app, `DezmerceBackendStack-${process.env.STAGE}`, {
    env: {
        account: '348649134109',
        region: 'ap-south-1'
    },
    domainName: process.env.BACKEND_DOMAIN as string,
    certArn: process.env.SSL_CERT_ARN as string,
    JWTSecret: process.env.JWT_SECRET as string,
    stage: process.env.STAGE as string,
    projectName: process.env.PROJECT_NAME as string
});

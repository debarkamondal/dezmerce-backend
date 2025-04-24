#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infra-stack';
import { ApiStack } from '../lib/api-stack';
import { SharedConfig } from '../lib/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

const app = new App();
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Define shared configuration
const config: SharedConfig = {
    domainName: process.env.DOMAIN_NAME || 'example.com',
    certArn: process.env.CERT_ARN || 'arn:aws:acm:region:account:certificate/certificate-id',
    JWTSecret: process.env.JWT_SECRET || 'your-secret',
    stage: process.env.STAGE || 'dev',
    projectName: process.env.PROJECT_NAME || 'dezmerceBackend',
    region: process.env.REGION || 'us-east-1'
};

// Define environment for all stacks
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT || '348649134109',
    region: config.region
};

// Create stacks
const infraStack = new InfrastructureStack(app, `${config.projectName}-${config.stage}-infra`, {
    config,
    stackName: `${config.projectName}-${config.stage}-infra`,
    env
});
const apiStack = new ApiStack(app, `${config.projectName}-${config.stage}-api`, {
    config,
    stackName: `${config.projectName}-${config.stage}-api`,
    table: infraStack.table,
    bucket: infraStack.bucket,
    env
});

apiStack.addDependency(infraStack);

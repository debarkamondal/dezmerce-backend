# Dezmerce Backend

A serverless backend application built with AWS CDK, TypeScript, and Hono.

## Overview

This project is a serverless e-commerce backend application. It uses AWS CDK to define and deploy infrastructure as code, including:

- DynamoDB tables for data storage
- S3 buckets for file storage
- Lambda functions for API handlers
- API Gateway for RESTful endpoints

Hono.js is used as the web framework for Lambda functions. Hono.js uses Web standards which makes porting the functions to other runtimes is easier especially because of the predefined bindings.

## Prerequisites

- Node.js (v20 or later)
- AWS CLI configured with appropriate credentials
- pnpm (recommended) or npm
- Docker (required if proper local build environment is not available for Lambda functions)
- ARN of ACM cert for the domain ([How to?](https://medium.com/@sonynwoye/creating-ssl-certificates-using-aws-certificate-manager-acm-1c359e70ce4d))

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/debarkamondal/dezmerce-backend 
cd dezmerce-backend
```

### 2. Install dependencies

```bash
pnpm install
# or with npm
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root with the following variables:

```
DOMAIN_NAME=your-domain.com
CERT_ARN=arn:aws:acm:region:account:certificate/certificate-id
JWT_SECRET=your-secret-key
STAGE=dev
PROJECT_NAME=dezmerceBackend
REGION=us-east-1
```

### 4. Deploy to AWS

```bash
npx cdk deploy --all
# or deploy specific stacks (replace <STAGE> with stage provided in .env)
npx cdk deploy dezmerceBackend-<STAGE>-infra dezmerceBackend-<STAGE>-api
```

## Project Structure

- `bin/` - CDK application entry point
- `lib/` - CDK stack definitions
  - `infra-stack.ts` - DynamoDB and S3 infrastructure
  - `api-stack.ts` - API Gateway and Lambda functions
  - `constructs/` - Custom CDK constructs
- `lambda/` - Lambda function implementations
  - `signin.ts` - Authentication handler
  - `user/` - User-related handlers
  - `admin/` - Admin-related handlers

## Useful Commands

- `pnpm run test` - Run tests
- `npx cdk deploy` - Deploy this stack to your default AWS account/region
- `npx cdk diff` - Compare deployed stack with current state
- `npx cdk synth` - Emit synthesized CloudFormation template
- `npx cdk watch` - Watch for changes and hot-swap lambdas (don't run prod server as this introduces stack drift for faster dev purposes only)



## License

[Your license information here]

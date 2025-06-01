export interface SharedConfig {
  backendDomainName: string;
  frontendDomainName: string;
  certArn: string;
  JWTSecret: string;
  stage: string;
  projectName: string;
  region: string;
  pgId: string;
  pgSecret: string;
}

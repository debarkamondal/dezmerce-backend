import { APIGatewaySimpleAuthorizerResult, APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { verify } from "hono/jwt";
export const handler = async (event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerResult> => {
    const decodedToken = await verify(event.headers?.authorization as string, process.env.JWTSecret as string)
    if (decodedToken.role === 'admin') {
        return {
            isAuthorized: true,
        };
    }
    return {
        isAuthorized: false
    };
}


import { APIGatewaySimpleAuthorizerWithContextResult, APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { verify } from "hono/jwt";
type context = {
    role?: string,
    email?: string | unknown
}
export const handler = async (event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerWithContextResult<context>> => {
    const decodedToken = await verify(event.headers?.authorization as string, process.env.JWTSecret as string)
    if (decodedToken.role === 'user') {
        return {
            isAuthorized: true,
            context: { role: decodedToken.role, email: decodedToken.email }
        };
    }
    return {
        isAuthorized: false,
        context: {}
    };
}


import { APIGatewaySimpleAuthorizerWithContextResult, APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { verify } from "hono/jwt";
type context = {
    role?: string
}
export const handler = async (event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerWithContextResult<context>> => {
    const decodedToken = await verify(event.headers?.authorization as string, process.env.JWTSecret as string)
    if (decodedToken.role === 'admin') {
        return {
            isAuthorized: true,
            context: { role: decodedToken.role }
        };
    }
    return {
        isAuthorized: false,
        context: {}
    };
}


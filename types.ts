import { ApiGatewayRequestContextV2 } from "hono/aws-lambda";

export type Product = {
    category: string;
    id: string;
    thumbnail: string;
    title: string;
    defaultDelivery: string;
    price: number;
    ratings: Array<number>;
    images: Array<string>;
    variants: Array<Array<string>>;
    info: string;
    specs: {
        [key: string]: string;
    }
}

export interface cartItem extends Product {
    qty: number;
}
export interface AuthContext extends ApiGatewayRequestContextV2 {
    requestContext: {
        authorizer: {
            lambda: {
                [key: string]: string;
            }
        }
    }
}

import { ApiGatewayRequestContextV2 } from "hono/aws-lambda";
export type CartItem = {
    id:string,
    title: string,
    image: string,
    url: string,
    price: number,
    qty: number,
}


export type Product = {
    category: string;
    id: string;
    gender:string;
    thumbnail: string;
    title: string;
    defaultDelivery: string;
    price: number;
    ratings: Array<number>;
    images: Array<string>;
    variants: Array<Array<string>>;
    description: string;
    specs: {
        [key: string]: string;
    }
}

export interface AuthEvent extends ApiGatewayRequestContextV2 {
    requestContext: {
        authorizer: {
            lambda: {
                [key: string]: string;
            }
        }
    }
}

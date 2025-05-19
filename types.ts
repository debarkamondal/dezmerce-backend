import { RequestContext } from "aws-cdk-lib/aws-apigateway";

export type CartItem = {
  category: string;
  id: string;
  title: string;
  image: string;
  price: number;
  qty: number;
};
export interface baseProduct {
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
  };
}
export interface resProduct extends baseProduct {
  category: string;
  id: string;
  gender: string;
}
export interface dbProduct extends baseProduct {
  pk: string; // product=${category}
  sk: string; // ulid
  lsi: string;
}

export interface AuthContext extends RequestContext {
  authorizer: {
    lambda: {
      role?: string;
      iat: string;
      email: string;
    };
  };
}

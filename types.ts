export type CartItem = {
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

export type AuthEvent = {
  role?: string;
  iat: string;
  email: string;
};

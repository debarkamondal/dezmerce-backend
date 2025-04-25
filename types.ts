
export type CartItem = {
    id: string,
    title: string,
    image: string,
    price: number
    qty: number;
}
export type Product = {
    category: string;
    id: string;
    gender: "male" | "female"
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

export type AuthEvent = {
    role?: string,
    iat: string,
    email: string
}

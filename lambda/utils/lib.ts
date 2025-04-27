import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.REGION as string;
const Bucket = process.env.BUCKET_NAME as string;
const s3Client = new S3Client({ region });

export const getPresignedUrl = (key: string) => {
    const command = new PutObjectCommand({ Bucket, Key: key, ContentType: "image/*" });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

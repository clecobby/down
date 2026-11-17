import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Profile photos live in S3 (served through CloudFront) when PHOTOS_BUCKET is set, otherwise on local disk for dev.
// The server's IAM role grants write access, so no keys are stored anywhere.
const BUCKET = process.env.PHOTOS_BUCKET;
const CDN = process.env.PHOTOS_CDN; // e.g. d123.cloudfront.net
const s3 = BUCKET ? new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }) : null;

export const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
await fs.mkdir(uploadDir, { recursive: true });

// Re-encode every upload: proves it's really an image, applies the camera rotation, caps the size,
// and drops all metadata — phone photos often carry the exact GPS spot where they were taken.
export async function processImage(buffer) {
  return sharp(buffer, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 1440, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

// Stores a processed JPEG and returns the URL to save on the profile.
export async function savePhoto(jpeg) {
  const name = `${randomUUID()}.jpg`;
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `photos/${name}`,
        Body: jpeg,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `https://${CDN}/photos/${name}`;
  }
  await fs.writeFile(path.join(uploadDir, name), jpeg);
  return `/uploads/${name}`;
}

// Removes a photo we stored (ignores demo photos hosted elsewhere).
export async function deletePhoto(url) {
  if (s3 && url.startsWith(`https://${CDN}/photos/`)) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: url.slice(`https://${CDN}/`.length) })).catch(() => {});
  } else if (url.startsWith('/uploads/')) {
    await fs.rm(path.join(uploadDir, path.basename(url)), { force: true });
  }
}

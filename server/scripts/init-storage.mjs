#!/usr/bin/env node
/**
 * Creates the B2 bucket named in B2_BUCKET if it does not exist, then proves the
 * credentials can write, read and delete an object in it.
 *
 * Deliberately a command you run rather than something the app does on first upload:
 * auto-creating inside a request means a typo in B2_BUCKET silently creates a junk
 * bucket, and in production it is infrastructure appearing without anyone asking.
 *
 *   npm run storage:init
 *
 * Idempotent — safe to run again.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader. dotenv is loaded by Nest at runtime, not by a standalone script. */
function readEnv() {
  const out = {};
  let text;
  try {
    text = readFileSync(path.join(root, '.env'), 'utf8');
  } catch {
    return out;
  }

  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z_0-9]+)\s*=\s*(.*)$/.exec(line);
    // Surrounding quotes are stripped, matching what dotenv does for the server.
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv(), ...process.env };
const required = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET', 'B2_ENDPOINT', 'B2_REGION'];
const missing = required.filter((k) => !env[k]?.trim());

if (missing.length > 0) {
  console.error(`\nMissing in server/.env: ${missing.join(', ')}\n`);
  process.exit(1);
}

const bucket = env.B2_BUCKET.trim();
const s3 = new S3Client({
  region: env.B2_REGION.trim(),
  endpoint: env.B2_ENDPOINT.trim(),
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.B2_KEY_ID.trim(),
    secretAccessKey: env.B2_APPLICATION_KEY.trim(),
  },
});

const notFound = (e) =>
  e?.name === 'NotFound' || e?.name === 'NoSuchBucket' || e?.$metadata?.httpStatusCode === 404;

console.log(`\nbucket   ${bucket}`);
console.log(`endpoint ${env.B2_ENDPOINT.trim()}`);
console.log(`region   ${env.B2_REGION.trim()}\n`);

let exists = false;
try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  exists = true;
  console.log('✓ bucket already exists');
} catch (e) {
  if (!notFound(e)) {
    // 403 here usually means the name is taken by another B2 account — bucket names are
    // globally unique — rather than anything wrong with the credentials.
    console.error(`✗ could not check the bucket: ${e.name} — ${e.message}`);
    if (e?.$metadata?.httpStatusCode === 403) {
      console.error('  A 403 on an existing name usually means another account owns it. Pick a different B2_BUCKET.');
    }
    process.exit(1);
  }
}

if (!exists) {
  try {
    // Private by default, which is what this app expects: nothing is served straight
    // from Backblaze, the API reads the bytes and serves them itself.
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log('✓ bucket created (private)');
  } catch (e) {
    console.error(`✗ could not create the bucket: ${e.name} — ${e.message}`);
    if (e?.name === 'BucketAlreadyExists') {
      console.error('  B2 bucket names are globally unique. Choose a more specific B2_BUCKET.');
    }
    if (e?.$metadata?.httpStatusCode === 403) {
      console.error('  The application key may be scoped to one bucket, which cannot create others.');
      console.error('  Either create the bucket in the B2 console, or use an account-wide key.');
    }
    process.exit(1);
  }
}

// Writing, reading and removing one object is the only check that actually proves the
// key has the permissions the app needs. HeadBucket alone does not.
const key = `_healthcheck/${Date.now()}.txt`;
try {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }));
  console.log('✓ write');

  await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  console.log('✓ read');

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('✓ delete');
} catch (e) {
  console.error(`✗ the key cannot ${e.name === 'AccessDenied' ? 'write/read/delete in' : 'use'} this bucket: ${e.name} — ${e.message}`);
  process.exit(1);
}

console.log('\nStorage is ready. Restart the server so it picks up the configuration.\n');

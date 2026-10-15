#!/usr/bin/env python3
import os
import sys
import boto3
from botocore.client import Config

if len(sys.argv) < 4:
    print("Usage: dentrinqo-s3-upload.py <timestamp> <db_enc_file> <files_enc_file> [manifest_file]")
    sys.exit(1)

timestamp = sys.argv[1]
db_enc = sys.argv[2]
files_enc = sys.argv[3]
manifest_file = sys.argv[4] if len(sys.argv) > 4 else None

endpoint = os.environ.get('S3_ENDPOINT')
bucket = os.environ.get('S3_BUCKET')
key_id = os.environ.get('AWS_ACCESS_KEY_ID')
secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-005')

s3 = boto3.client(
    's3',
    endpoint_url=endpoint,
    aws_access_key_id=key_id,
    aws_secret_access_key=secret_key,
    config=Config(signature_version='s3v4'),
    region_name=region
)

db_key = f"nightly/{timestamp}/{os.path.basename(db_enc)}"
files_key = f"nightly/{timestamp}/{os.path.basename(files_enc)}"

print(f"Uploading {db_enc} -> s3://{bucket}/{db_key}...")
s3.upload_file(db_enc, bucket, db_key)

print(f"Uploading {files_enc} -> s3://{bucket}/{files_key}...")
s3.upload_file(files_enc, bucket, files_key)

if manifest_file and os.path.exists(manifest_file):
    manifest_key = f"nightly/{timestamp}/manifest.json"
    print(f"Uploading {manifest_file} -> s3://{bucket}/{manifest_key}...")
    s3.upload_file(manifest_file, bucket, manifest_key)

print("Backblaze B2 S3 upload completed successfully.")

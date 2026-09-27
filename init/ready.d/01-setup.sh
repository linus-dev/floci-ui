#!/bin/sh
set -e

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566

echo "=== Creating S3 buckets ==="
aws s3 mb s3://my-app-bucket || true
aws s3 mb s3://logs-bucket || true
aws s3 mb s3://static-assets || true

echo "=== Uploading files ==="
aws s3 cp /etc/floci/init/files/config.json s3://my-app-bucket/config.json
aws s3 cp /etc/floci/init/files/index.html s3://static-assets/index.html

echo "=== Creating SQS queues ==="
aws --endpoint-url http://localhost:4566 --region us-east-1 sqs create-queue --queue-name orders-queue || true
aws --endpoint-url http://localhost:4566 --region us-east-1 sqs create-queue --queue-name notifications-queue || true
aws --endpoint-url http://localhost:4566 --region us-east-1 sqs create-queue --queue-name dead-letter-queue || true

echo "=== Done ==="

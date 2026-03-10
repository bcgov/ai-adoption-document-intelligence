#!/bin/sh

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
until mc alias set local http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}; do
  echo "MinIO not ready yet, retrying in 2 seconds..."
  sleep 2
done

echo "MinIO is ready. Creating buckets..."

# Create buckets if they don't exist
mc mb --ignore-existing local/document-blobs
mc mb --ignore-existing local/benchmark-outputs

echo "Buckets created successfully:"
mc ls local

echo "MinIO initialization complete."

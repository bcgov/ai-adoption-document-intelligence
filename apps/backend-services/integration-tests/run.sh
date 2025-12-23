#!/bin/bash
set -e

# Config
CONTAINER_NAME=ai-backend-test-postgres
POSTGRES_USER=testuser
POSTGRES_PASSWORD=testpass
POSTGRES_DB=testdb
POSTGRES_IMAGE=postgres:16
PORT=5555


# Ensure no existing container is running
if podman ps -a --format '{{.Names}}' | grep -Eq "^$CONTAINER_NAME$"; then
  echo "Stopping existing container $CONTAINER_NAME..."
  podman stop $CONTAINER_NAME || true
fi

# Start Postgres container
podman run -d --rm --name $CONTAINER_NAME -e POSTGRES_USER=$POSTGRES_USER -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -e POSTGRES_DB=$POSTGRES_DB -p $PORT:5432 $POSTGRES_IMAGE

echo "Waiting for Postgres to be ready..."
for i in {1..30}; do
  if podman exec $CONTAINER_NAME pg_isready -U $POSTGRES_USER > /dev/null 2>&1; then
    echo "Postgres is ready!"
    break
  fi
  sleep 1
done

# Set DATABASE_URL for Prisma
export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$PORT/$POSTGRES_DB?schema=public"

echo "Running Prisma migrations..."
npx prisma migrate deploy
npx prisma generate

echo "Running tests..."
npm run test:int

# Stop the container
podman stop $CONTAINER_NAME

#!/bin/bash
set -e

echo "Waiting for PostgreSQL to be ready..."
sleep 2

echo "Checking and creating MLflow database resources..."

# Check if mlflow user exists, create if not
if ! psql -h postgres -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='mlflow'" | grep -q 1; then
  echo "Creating mlflow user..."
  psql -h postgres -U postgres -c "CREATE USER mlflow WITH PASSWORD 'mlflow_password';"
else
  echo "mlflow user already exists"
fi

# Check if mlflow database exists, create if not
if ! psql -h postgres -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mlflow'" | grep -q 1; then
  echo "Creating mlflow database..."
  psql -h postgres -U postgres -c "CREATE DATABASE mlflow OWNER mlflow;"
else
  echo "mlflow database already exists"
fi

# Grant privileges (idempotent operation)
echo "Granting privileges..."
psql -h postgres -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE mlflow TO mlflow;"

echo "MLflow database resources are ready!"

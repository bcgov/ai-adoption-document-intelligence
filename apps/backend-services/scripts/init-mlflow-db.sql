-- Create MLflow database if it doesn't exist
-- This script is executed automatically by PostgreSQL on container initialization

-- Create mlflow user (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mlflow') THEN
    CREATE USER mlflow WITH PASSWORD 'mlflow_password';
  END IF;
END
$$;

-- Create mlflow database (if not exists)
SELECT 'CREATE DATABASE mlflow OWNER mlflow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mlflow')\gexec

-- Grant necessary privileges
GRANT ALL PRIVILEGES ON DATABASE mlflow TO mlflow;

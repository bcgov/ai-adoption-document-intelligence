# AI OCR Backend

NestJS backend API for the AI OCR Dashboard application.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or Podman/Docker for running PostgreSQL)
- npm or yarn

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the backend directory. **Important**: Make sure the file is saved with UTF-8 encoding (without BOM).

**Option A: Copy from example (Windows PowerShell)**
```powershell
# Create .env file with proper encoding
Get-Content env.example | Out-File -FilePath .env -Encoding utf8
```

**Option B: Copy from example (Git Bash/Linux/Mac)**
```bash
cp env.example .env
```

**Option C: Manual creation**
Create a `.env` file manually and ensure it contains:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=ai_ocr
```

**Note**: If you encounter encoding errors (like "unexpected character"), delete the `.env` file and recreate it using one of the methods above.

### 3. Start PostgreSQL Database

#### Option A: Using Podman (Recommended for this setup)

**Using podman-compose:**
```bash
podman-compose up -d
```

**Using podman compose (with space):**
```bash
podman compose up -d
```

**Note**: If you get an error about docker-compose being used, you can:
1. Use `podman-compose` explicitly (if installed separately)
2. Or set the compose provider: `podman compose --compose-provider=podman-compose up -d`
3. Or use `compose.yml` instead of `docker-compose.yml` (we've created both)

#### Option B: Using Docker Compose

```bash
docker-compose up -d
```

#### Option C: Using Local PostgreSQL

Make sure PostgreSQL is installed and running on your machine, then create a database:

```sql
CREATE DATABASE ai_ocr;
```

Update the `.env` file with your PostgreSQL credentials.

### 4. Run the Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check endpoint

## Database Migrations

```bash
# Generate a new migration
npm run migration:generate -- src/migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

## Project Structure

```
src/
├── main.ts              # Application entry point
├── app.module.ts        # Root module
├── app.controller.ts    # Root controller
├── app.service.ts       # Root service
├── data-source.ts       # TypeORM data source configuration
├── entities/            # TypeORM entities
├── modules/             # Feature modules
└── migrations/          # Database migrations
```

## Troubleshooting

### Podman Compose Issues

If `podman compose` tries to use docker-compose:
1. Make sure you have `podman-compose` installed separately, or
2. Use `podman-compose` command directly, or
3. Use the `compose.yml` file which podman prefers

### Environment File Encoding Issues

If you see errors like "unexpected character" in `.env`:
1. Delete the existing `.env` file
2. Recreate it using PowerShell: `Get-Content env.example | Out-File -FilePath .env -Encoding utf8`
3. Or manually create it in your editor and ensure it's saved as UTF-8 (no BOM)

## Development

- The database will automatically synchronize schema changes in development mode (`synchronize: true`)
- In production, use migrations instead of synchronize
- CORS is enabled for `http://localhost:5173` by default (configurable via `FRONTEND_URL`)

## License

MIT

#!/bin/bash
#
# Integration Test Runner for Graph Workflow
#
# This script helps run the graph workflow integration test by ensuring
# all required services are running.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# script lives at apps/backend-services/integration-tests/graph-workflow-tests
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/apps/backend-services"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}  Graph Workflow Integration Test Runner${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo ""

# Check if services are running
check_http_service() {
    local name=$1
    local url=$2
    local max_attempts=3
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        # Backend health check: 200 or 401 both indicate the server is up.
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
        if [ "$status" = "200" ] || [ "$status" = "401" ]; then
            echo -e "${GREEN}✓${NC} $name is running (HTTP $status)"
            return 0
        fi
        attempt=$((attempt + 1))
        if [ $attempt -le $max_attempts ]; then
            sleep 1
        fi
    done

    echo -e "${RED}✗${NC} $name is not reachable at $url"
    return 1
}

# Temporal gRPC endpoint is not HTTP; just check the TCP port is open.
check_tcp_port() {
    local name=$1
    local host=$2
    local port=$3
    if command -v nc >/dev/null 2>&1; then
        if nc -z "$host" "$port" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $name is listening on $host:$port"
            return 0
        fi
    fi
    echo -e "${YELLOW}⚠${NC} Could not verify $name port ($host:$port). Install netcat (nc) to enable this check."
    return 0
}

# Service checks
echo "Checking required services..."
echo ""

TEMPORAL_OK=false
BACKEND_OK=false

if check_tcp_port "Temporal Server" "localhost" "7233"; then
    TEMPORAL_OK=true
fi

if check_http_service "Backend API" "http://localhost:3002/api/models"; then
    BACKEND_OK=true
fi

echo ""

# Provide guidance if services are not running
if [ "$TEMPORAL_OK" = false ] || [ "$BACKEND_OK" = false ]; then
    echo -e "${YELLOW}Some services are not running. Please start them:${NC}"
    echo ""

    if [ "$TEMPORAL_OK" = false ]; then
        echo -e "${YELLOW}Temporal Server:${NC}"
        echo "  cd $PROJECT_ROOT"
        echo "  docker compose --profile temporal up -d"
        echo "  cd $PROJECT_ROOT/apps/temporal && npm run dev  # Start Temporal worker"
        echo ""
    fi

    if [ "$BACKEND_OK" = false ]; then
        echo -e "${YELLOW}Backend Services:${NC}"
        echo "  cd $PROJECT_ROOT"
        echo "  docker compose --profile infra up -d  # Start PostgreSQL"
        echo "  cd $PROJECT_ROOT/apps/backend-services && npm run start:dev  # Start backend"
        echo ""
    fi

    echo -e "${RED}Exiting. Please start the required services first.${NC}"
    exit 1
fi

# All services are running, run the test
echo -e "${GREEN}All services are running!${NC}"
echo ""
echo "Running integration test..."
echo ""

cd "$PROJECT_ROOT/apps/backend-services"
npm run test:int:workflow

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "${GREEN}  Integration test completed successfully!${NC}"
    echo -e "${GREEN}===========================================================${NC}"
else
    echo -e "${RED}===========================================================${NC}"
    echo -e "${RED}  Integration test failed with exit code $exit_code${NC}"
    echo -e "${RED}===========================================================${NC}"
fi

exit $exit_code

#!/usr/bin/env bash
#
# oc-deploy-instance.sh — Deploy a full instance stack to OpenShift from local tooling.
#
# Mirrors the deploy job in .github/workflows/deploy-instance.yml using values from
# deployments/openshift/config/<env>.env. Pair with ./scripts/oc-build-push.sh when you
# need images built from your current branch.
#
# Prerequisites:
#   - oc, kustomize (v4+), helm (for PLG — optional via --skip-plg)
#   - ./scripts/oc-setup-sa.sh --namespace <target-ns> and ./scripts/oc-login-sa.sh --namespace <target-ns>
#
# Usage:
#   ./scripts/oc-build-push.sh --env dev --all --tag my-loadtest-tag
#   ./scripts/oc-deploy-instance.sh --env dev --namespace fd34fb-test --image-tag my-loadtest-tag \
#       --instance loadtest-abc --confirm
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/lib/config-loader.sh"
source "${SCRIPT_DIR}/lib/instance-name.sh"
source "${SCRIPT_DIR}/lib/generate-overlay.sh"

DEPLOY_PLG="${DEPLOY_PLG:-true}"

ENV_PROFILE=""
OC_NAMESPACE=""
IMAGE_TAG=""
SKIP_OC_LOGIN=false
SKIP_PLG=false
CONFIRM=false
DOCUMENT_INTELLIGENCE_MODE_OVERRIDE=""
MOCK_OCR_OVERRIDE=""
BLOB_PROVIDER_OVERRIDE=""
MINIO_PVC_SIZE_OVERRIDE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> --namespace <openshift-ns> --image-tag <tag> [options]

Required:
  --env <dev|prod>          Configuration profile (deployments/openshift/config/<env>.env)
  --namespace <ns>          Target OpenShift namespace (e.g. fd34fb-test)
  --image-tag <tag>         Tag for all three images (must exist in Artifactory)

Options:
  --instance <name>         Instance name (default: sanitized current git branch, max 20 chars)
  --confirm                 Required acknowledgement before applying manifests
  --skip-oc-login           Assume current oc context is already authenticated for the namespace
  --skip-plg                Skip Grafana/Loki/Prometheus Helm install
  --document-intelligence-mode <live|mock>   Override DOCUMENT_INTELLIGENCE_MODE from config
  --mock-azure-ocr <true|false>              Override MOCK_AZURE_OCR for the Temporal worker
  --blob-storage-provider <azure|minio>      Override BLOB_STORAGE_PROVIDER. When 'minio', this
                                             also deploys a per-instance MinIO Deployment + Service
                                             + PVC + bucket-init Job and seeds <instance>-minio-credentials.
  --minio-pvc-size <size>                    PVC size for the per-instance MinIO data volume (default 5Gi)

Environment:
  DEPLOY_PLG=false          Same as --skip-plg

Examples:
  $(basename "$0") --env dev --namespace fd34fb-test --image-tag ai-1209-load --confirm
  $(basename "$0") --env dev -n fd34fb-test -t ai-1209-load -i loadtest-1 --confirm \\
      --document-intelligence-mode mock --mock-azure-ocr true \\
      --blob-storage-provider minio --minio-pvc-size 5Gi
EOF
}

PASS_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_PROFILE="$2"
      shift 2
      ;;
    --namespace|-n)
      OC_NAMESPACE="$2"
      shift 2
      ;;
    --image-tag|-t)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --instance|-i)
      PASS_ARGS+=(--instance "$2")
      shift 2
      ;;
    --confirm)
      CONFIRM=true
      shift
      ;;
    --skip-oc-login)
      SKIP_OC_LOGIN=true
      shift
      ;;
    --skip-plg)
      SKIP_PLG=true
      shift
      ;;
    --document-intelligence-mode)
      DOCUMENT_INTELLIGENCE_MODE_OVERRIDE="$2"
      shift 2
      ;;
    --mock-azure-ocr)
      MOCK_OCR_OVERRIDE="$2"
      shift 2
      ;;
    --blob-storage-provider)
      BLOB_PROVIDER_OVERRIDE="$2"
      shift 2
      ;;
    --minio-pvc-size)
      MINIO_PVC_SIZE_OVERRIDE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${SKIP_PLG}" == true ]] || [[ "${DEPLOY_PLG}" == "false" ]]; then
  DEPLOY_PLG_EFFECTIVE=false
else
  DEPLOY_PLG_EFFECTIVE=true
fi

if [[ -z "${ENV_PROFILE}" || -z "${OC_NAMESPACE}" || -z "${IMAGE_TAG}" ]]; then
  echo "[ERROR] --env, --namespace, and --image-tag are required." >&2
  usage >&2
  exit 1
fi

if [[ "${CONFIRM}" != true ]]; then
  echo "[ERROR] Refusing to apply without --confirm (this targets namespace ${OC_NAMESPACE})." >&2
  exit 1
fi

INSTANCE_NAME=$(resolve_instance_name "${PASS_ARGS[@]}") || exit 1
load_config --env "${ENV_PROFILE}" --instance "${INSTANCE_NAME}" || exit $?

optional_cfg() {
  local key="$1"
  local default="$2"
  local val=""
  val=$(get_config "${key}" 2>/dev/null) && echo "${val}" || echo "${default}"
}

require_cfg() {
  local key="$1"
  local val=""
  val=$(get_config "${key}") || {
    echo "[ERROR] Missing required config key: ${key} in deployments/openshift/config/${ENV_PROFILE}.env" >&2
    exit 1
  }
  echo "${val}"
}

ARTIFACTORY_URL=$(require_cfg ARTIFACTORY_URL)
CLUSTER_DOMAIN=$(require_cfg CLUSTER_DOMAIN)
ARTIFACTORY_SA_USERNAME=$(require_cfg ARTIFACTORY_SA_USERNAME)
ARTIFACTORY_SA_PASSWORD=$(require_cfg ARTIFACTORY_SA_PASSWORD)

SSO_AUTH_SERVER_URL=$(require_cfg SSO_AUTH_SERVER_URL)
SSO_REALM=$(require_cfg SSO_REALM)
SSO_CLIENT_ID=$(require_cfg SSO_CLIENT_ID)
SSO_CLIENT_SECRET=$(require_cfg SSO_CLIENT_SECRET)

BOOTSTRAP_ADMIN_EMAIL=$(optional_cfg BOOTSTRAP_ADMIN_EMAIL "")
BLOB_STORAGE_PROVIDER=$(optional_cfg BLOB_STORAGE_PROVIDER azure)
AZURE_STORAGE_CONTAINER_NAME=$(optional_cfg AZURE_STORAGE_CONTAINER_NAME document-blobs)
BENCHMARK_TASK_QUEUE=$(optional_cfg BENCHMARK_TASK_QUEUE benchmark-processing)
ENABLE_BENCHMARK_QUEUE=$(optional_cfg ENABLE_BENCHMARK_QUEUE true)
BODY_LIMIT=$(optional_cfg BODY_LIMIT 50mb)

THROTTLE_GLOBAL_TTL_MS=$(optional_cfg THROTTLE_GLOBAL_TTL_MS 60000)
THROTTLE_GLOBAL_LIMIT=$(optional_cfg THROTTLE_GLOBAL_LIMIT 100)
THROTTLE_AUTH_TTL_MS=$(optional_cfg THROTTLE_AUTH_TTL_MS 60000)
THROTTLE_AUTH_LIMIT=$(optional_cfg THROTTLE_AUTH_LIMIT 10)
THROTTLE_AUTH_REFRESH_TTL_MS=$(optional_cfg THROTTLE_AUTH_REFRESH_TTL_MS 60000)
THROTTLE_AUTH_REFRESH_LIMIT=$(optional_cfg THROTTLE_AUTH_REFRESH_LIMIT 5)

DB_POOL_MAX=$(optional_cfg DB_POOL_MAX 10)

AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=$(optional_cfg AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT "")
AZURE_DOC_INTELLIGENCE_MODELS=$(optional_cfg AZURE_DOC_INTELLIGENCE_MODELS prebuilt-layout)
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=$(require_cfg AZURE_DOCUMENT_INTELLIGENCE_API_KEY)

AZURE_OPENAI_ENDPOINT=$(optional_cfg AZURE_OPENAI_ENDPOINT "")
AZURE_OPENAI_DEPLOYMENT=$(optional_cfg AZURE_OPENAI_DEPLOYMENT "")
AZURE_OPENAI_API_VERSION=$(optional_cfg AZURE_OPENAI_API_VERSION 2024-02-15-preview)
ENRICHMENT_REDACT_PII=$(optional_cfg ENRICHMENT_REDACT_PII false)
AZURE_OPENAI_API_KEY=$(require_cfg AZURE_OPENAI_API_KEY)

AZURE_STORAGE_CONNECTION_STRING=$(require_cfg AZURE_STORAGE_CONNECTION_STRING)
AZURE_STORAGE_ACCOUNT_NAME=$(require_cfg AZURE_STORAGE_ACCOUNT_NAME)
AZURE_STORAGE_ACCOUNT_KEY=$(require_cfg AZURE_STORAGE_ACCOUNT_KEY)

PG_BACKUP_STORAGE_SIZE=$(optional_cfg PG_BACKUP_STORAGE_SIZE 10Gi)

DOCUMENT_INTELLIGENCE_MODE=$(optional_cfg DOCUMENT_INTELLIGENCE_MODE live)
MOCK_AZURE_OCR=$(optional_cfg MOCK_AZURE_OCR false)

if [[ -n "${DOCUMENT_INTELLIGENCE_MODE_OVERRIDE}" ]]; then
  DOCUMENT_INTELLIGENCE_MODE="${DOCUMENT_INTELLIGENCE_MODE_OVERRIDE}"
fi
if [[ -n "${MOCK_OCR_OVERRIDE}" ]]; then
  MOCK_AZURE_OCR="${MOCK_OCR_OVERRIDE}"
fi
if [[ -n "${BLOB_PROVIDER_OVERRIDE}" ]]; then
  BLOB_STORAGE_PROVIDER="${BLOB_PROVIDER_OVERRIDE}"
fi

if [[ "${BLOB_STORAGE_PROVIDER}" != "azure" && "${BLOB_STORAGE_PROVIDER}" != "minio" ]]; then
  echo "[ERROR] BLOB_STORAGE_PROVIDER must be 'azure' or 'minio' (got '${BLOB_STORAGE_PROVIDER}')." >&2
  exit 1
fi

WITH_MINIO=false
MINIO_PVC_SIZE=$(optional_cfg MINIO_PVC_SIZE 5Gi)
if [[ -n "${MINIO_PVC_SIZE_OVERRIDE}" ]]; then
  MINIO_PVC_SIZE="${MINIO_PVC_SIZE_OVERRIDE}"
fi
MINIO_ENDPOINT_VALUE=""
MINIO_DOCUMENT_BUCKET_VALUE=""
if [[ "${BLOB_STORAGE_PROVIDER}" == "minio" ]]; then
  WITH_MINIO=true
  MINIO_ENDPOINT_VALUE="http://${INSTANCE_NAME}-minio:9000"
  MINIO_DOCUMENT_BUCKET_VALUE=$(optional_cfg MINIO_DOCUMENT_BUCKET document-blobs)
fi

GRAFANA_ADMIN_PASSWORD=$(optional_cfg GRAFANA_ADMIN_PASSWORD admin)
LOKI_RETENTION_DAYS=$(optional_cfg LOKI_RETENTION_DAYS 30)
LOKI_PVC_SIZE=$(optional_cfg LOKI_PVC_SIZE 10Gi)
PROMETHEUS_PVC_SIZE=$(optional_cfg PROMETHEUS_PVC_SIZE 10Gi)
METRICS_SCRAPE_INTERVAL=$(optional_cfg METRICS_SCRAPE_INTERVAL 15s)

for bin in oc; do
  command -v "${bin}" >/dev/null 2>&1 || {
    echo "[ERROR] Required command not found: ${bin}" >&2
    exit 1
  }
done

if [[ "${DEPLOY_PLG_EFFECTIVE}" == true ]]; then
  command -v helm >/dev/null 2>&1 || {
    echo "[ERROR] helm not found (install helm or pass --skip-plg)." >&2
    exit 1
  }
fi

if [[ "${SKIP_OC_LOGIN}" != true ]]; then
  "${SCRIPT_DIR}/oc-login-sa.sh" --namespace "${OC_NAMESPACE}"
fi

CURRENT_NS=$(oc project -q 2>/dev/null) || true
if [[ "${CURRENT_NS}" != "${OC_NAMESPACE}" ]]; then
  oc project "${OC_NAMESPACE}" >/dev/null
fi

IMAGE_BASE="${ARTIFACTORY_URL}/kfd3-fd34fb-local"

FRONTEND_URL="https://${INSTANCE_NAME}-frontend-${OC_NAMESPACE}.${CLUSTER_DOMAIN}"
BACKEND_URL="https://${INSTANCE_NAME}-backend-${OC_NAMESPACE}.${CLUSTER_DOMAIN}"

echo ""
echo "=========================================="
echo "  Instance:     ${INSTANCE_NAME}"
echo "  Namespace:    ${OC_NAMESPACE}"
echo "  Image tag:    ${IMAGE_TAG}"
echo "  Backend URL:  ${BACKEND_URL}"
echo "  Frontend URL: ${FRONTEND_URL}"
echo "=========================================="
echo ""

MINIO_ROOT_USER=""
MINIO_ROOT_PASSWORD=""
if [[ "${WITH_MINIO}" == true ]]; then
  MINIO_SECRET="${INSTANCE_NAME}-minio-credentials"
  echo "[INFO] Resolving MinIO credentials for ${MINIO_SECRET}..."
  if oc get secret "${MINIO_SECRET}" -n "${OC_NAMESPACE}" &>/dev/null; then
    echo "[INFO] Reusing existing ${MINIO_SECRET} credentials."
    MINIO_ROOT_USER=$(oc get secret "${MINIO_SECRET}" -n "${OC_NAMESPACE}" \
      -o jsonpath='{.data.MINIO_ROOT_USER}' | base64 -d)
    MINIO_ROOT_PASSWORD=$(oc get secret "${MINIO_SECRET}" -n "${OC_NAMESPACE}" \
      -o jsonpath='{.data.MINIO_ROOT_PASSWORD}' | base64 -d)
  fi
  if [[ -z "${MINIO_ROOT_USER}" || -z "${MINIO_ROOT_PASSWORD}" ]]; then
    if ! command -v openssl >/dev/null 2>&1; then
      echo "[ERROR] openssl required to seed MinIO credentials." >&2
      exit 1
    fi
    echo "[INFO] Generating new MinIO credentials."
    MINIO_ROOT_USER=$(openssl rand -hex 12)
    MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)
  fi
fi

OVERLAY_DIR="$(generate_instance_overlay \
  --instance "${INSTANCE_NAME}" \
  --namespace "${OC_NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${IMAGE_BASE}/backend-services" \
  --frontend-image "${IMAGE_BASE}/frontend" \
  --worker-image "${IMAGE_BASE}/temporal" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}" \
  --bootstrap-admin-email "${BOOTSTRAP_ADMIN_EMAIL}" \
  --blob-storage-provider "${BLOB_STORAGE_PROVIDER}" \
  --azure-storage-container-name "${AZURE_STORAGE_CONTAINER_NAME}" \
  --benchmark-task-queue "${BENCHMARK_TASK_QUEUE}" \
  --enable-benchmark-queue "${ENABLE_BENCHMARK_QUEUE}" \
  --body-limit "${BODY_LIMIT}" \
  --throttle-global-ttl-ms "${THROTTLE_GLOBAL_TTL_MS}" \
  --throttle-global-limit "${THROTTLE_GLOBAL_LIMIT}" \
  --throttle-auth-ttl-ms "${THROTTLE_AUTH_TTL_MS}" \
  --throttle-auth-limit "${THROTTLE_AUTH_LIMIT}" \
  --throttle-auth-refresh-ttl-ms "${THROTTLE_AUTH_REFRESH_TTL_MS}" \
  --throttle-auth-refresh-limit "${THROTTLE_AUTH_REFRESH_LIMIT}" \
  --db-pool-max "${DB_POOL_MAX}" \
  --azure-openai-endpoint "${AZURE_OPENAI_ENDPOINT}" \
  --azure-openai-deployment "${AZURE_OPENAI_DEPLOYMENT}" \
  --azure-openai-api-version "${AZURE_OPENAI_API_VERSION}" \
  --enrichment-redact-pii "${ENRICHMENT_REDACT_PII}" \
  --azure-doc-intelligence-endpoint "${AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT}" \
  --azure-doc-intelligence-models "${AZURE_DOC_INTELLIGENCE_MODELS}" \
  --pg-backup-storage-size "${PG_BACKUP_STORAGE_SIZE}" \
  --document-intelligence-mode "${DOCUMENT_INTELLIGENCE_MODE}" \
  --mock-azure-ocr "${MOCK_AZURE_OCR}" \
  --minio-endpoint "${MINIO_ENDPOINT_VALUE}" \
  --minio-document-bucket "${MINIO_DOCUMENT_BUCKET_VALUE}" \
  --minio-pvc-size "${MINIO_PVC_SIZE}" \
  --minio-root-user "${MINIO_ROOT_USER}" \
  --minio-root-password "${MINIO_ROOT_PASSWORD}" \
  $(if [[ "${WITH_MINIO}" == true ]]; then echo "--with-minio"; fi))"

cleanup_overlay() {
  cleanup_generated_overlay "${OVERLAY_DIR}"
}
trap cleanup_overlay EXIT

if [[ "${WITH_MINIO}" == true ]]; then
  MINIO_INIT_JOB="${INSTANCE_NAME}-minio-init"
  # Job spec is immutable so re-applying with kustomize would fail. Drop the
  # previous init Job and let the apply below recreate it from the overlay.
  if oc get job "${MINIO_INIT_JOB}" -n "${OC_NAMESPACE}" &>/dev/null; then
    echo "[INFO] Removing existing ${MINIO_INIT_JOB} so kustomize can recreate it..."
    oc delete job "${MINIO_INIT_JOB}" -n "${OC_NAMESPACE}" --wait=true >/dev/null 2>&1 || true
  fi
fi

echo "[INFO] Applying Kustomize manifests via oc apply -k (uses oc's built-in kustomize)..."
oc apply -k "${OVERLAY_DIR}" -n "${OC_NAMESPACE}"

if [[ "${WITH_MINIO}" == true ]]; then
  oc label secret "${INSTANCE_NAME}-minio-credentials" \
    "app.kubernetes.io/instance=${INSTANCE_NAME}" --overwrite -n "${OC_NAMESPACE}" 2>/dev/null || true
fi

PULL_SECRET="${INSTANCE_NAME}-artifactory-pull"
echo "[INFO] Ensuring image pull secret ${PULL_SECRET}..."
oc create secret docker-registry "${PULL_SECRET}" \
  --docker-server="${ARTIFACTORY_URL}" \
  --docker-username="${ARTIFACTORY_SA_USERNAME}" \
  --docker-password="${ARTIFACTORY_SA_PASSWORD}" \
  --dry-run=client -o yaml | oc apply -f - -n "${OC_NAMESPACE}"

oc label secret "${PULL_SECRET}" \
  "app.kubernetes.io/instance=${INSTANCE_NAME}" --overwrite -n "${OC_NAMESPACE}" 2>/dev/null || true

for dep in backend-services frontend temporal temporal-ui temporal-worker; do
  DEPLOY="${INSTANCE_NAME}-${dep}"
  if oc get deployment "${DEPLOY}" -n "${OC_NAMESPACE}" &>/dev/null; then
    oc patch deployment "${DEPLOY}" -n "${OC_NAMESPACE}" --type=merge -p \
      "{\"spec\":{\"template\":{\"spec\":{\"imagePullSecrets\":[{\"name\":\"${PULL_SECRET}\"}]}}}}" 2>/dev/null || true
  fi
done

BACKEND_SECRET="${INSTANCE_NAME}-backend-services-secrets"
echo "[INFO] Applying backend secret ${BACKEND_SECRET}..."
oc create secret generic "${BACKEND_SECRET}" \
  --from-literal="SSO_CLIENT_SECRET=${SSO_CLIENT_SECRET}" \
  --from-literal="AZURE_DOCUMENT_INTELLIGENCE_API_KEY=${AZURE_DOCUMENT_INTELLIGENCE_API_KEY}" \
  --from-literal="AZURE_STORAGE_CONNECTION_STRING=${AZURE_STORAGE_CONNECTION_STRING}" \
  --from-literal="AZURE_STORAGE_ACCOUNT_NAME=${AZURE_STORAGE_ACCOUNT_NAME}" \
  --from-literal="AZURE_STORAGE_ACCOUNT_KEY=${AZURE_STORAGE_ACCOUNT_KEY}" \
  --dry-run=client -o yaml | oc apply -f - -n "${OC_NAMESPACE}"

oc label secret "${BACKEND_SECRET}" \
  "app.kubernetes.io/instance=${INSTANCE_NAME}" --overwrite -n "${OC_NAMESPACE}" 2>/dev/null || true

WORKER_SECRET="${INSTANCE_NAME}-temporal-worker-secrets"
echo "[INFO] Applying temporal worker secret ${WORKER_SECRET}..."
oc create secret generic "${WORKER_SECRET}" \
  --from-literal="AZURE_DOCUMENT_INTELLIGENCE_API_KEY=${AZURE_DOCUMENT_INTELLIGENCE_API_KEY}" \
  --from-literal="AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}" \
  --from-literal="AZURE_STORAGE_CONNECTION_STRING=${AZURE_STORAGE_CONNECTION_STRING}" \
  --from-literal="AZURE_STORAGE_ACCOUNT_NAME=${AZURE_STORAGE_ACCOUNT_NAME}" \
  --from-literal="AZURE_STORAGE_ACCOUNT_KEY=${AZURE_STORAGE_ACCOUNT_KEY}" \
  --dry-run=client -o yaml | oc apply -f - -n "${OC_NAMESPACE}"

oc label secret "${WORKER_SECRET}" \
  "app.kubernetes.io/instance=${INSTANCE_NAME}" --overwrite -n "${OC_NAMESPACE}" 2>/dev/null || true

if [[ "${DEPLOY_PLG_EFFECTIVE}" == true ]]; then
  PLG_CHART_DIR="${PROJECT_ROOT}/deployments/openshift/helm/plg"
  PLG_RELEASE="${INSTANCE_NAME}-plg"
  echo "[INFO] Helm upgrade --install ${PLG_RELEASE}..."
  helm upgrade --install "${PLG_RELEASE}" "${PLG_CHART_DIR}" \
    --namespace "${OC_NAMESPACE}" \
    -f "${PLG_CHART_DIR}/values-openshift.yaml" \
    --set "grafana.adminPassword=${GRAFANA_ADMIN_PASSWORD}" \
    --set "loki.retentionDays=${LOKI_RETENTION_DAYS}" \
    --set "loki.pvcSize=${LOKI_PVC_SIZE}" \
    --set "prometheus.pvcSize=${PROMETHEUS_PVC_SIZE}" \
    --set "prometheus.scrapeInterval=${METRICS_SCRAPE_INTERVAL}" \
    --set "prometheus.scrapeTargets.backendServices.host=${INSTANCE_NAME}-backend-services" \
    --set "prometheus.scrapeTargets.temporalServer.host=${INSTANCE_NAME}-temporal" \
    --wait --timeout 120s || echo "[WARN] PLG deployment failed or timed out (non-blocking)."
fi

SERVICES=(backend-services frontend temporal temporal-ui temporal-worker)
if [[ "${WITH_MINIO}" == true ]]; then
  SERVICES+=(minio)
fi

for svc in "${SERVICES[@]}"; do
  DEPLOY="${INSTANCE_NAME}-${svc}"
  if oc get deployment "${DEPLOY}" -n "${OC_NAMESPACE}" &>/dev/null; then
    oc rollout restart "deployment/${DEPLOY}" -n "${OC_NAMESPACE}" || true
  fi
done

for svc in "${SERVICES[@]}"; do
  DEPLOY="${INSTANCE_NAME}-${svc}"
  if oc get deployment "${DEPLOY}" -n "${OC_NAMESPACE}" &>/dev/null; then
    echo "[INFO] Waiting for ${DEPLOY}..."
    oc rollout status "deployment/${DEPLOY}" -n "${OC_NAMESPACE}" --timeout=300s || \
      echo "[WARN] Rollout timed out for ${DEPLOY}"
  fi
done

trap - EXIT
cleanup_generated_overlay "${OVERLAY_DIR}"

echo ""
echo "[INFO] Deploy finished."
echo "[INFO] Frontend: ${FRONTEND_URL}"
echo "[INFO] Backend:  ${BACKEND_URL}"
echo "[INFO] Tear down: ./scripts/oc-teardown.sh --namespace ${OC_NAMESPACE} --instance ${INSTANCE_NAME}"
echo ""

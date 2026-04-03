#!/usr/bin/env bash
#
# generate-overlay.sh — Generate an instance-specific Kustomize overlay from the template.
#
# Creates a temporary overlay directory by copying the instance-template and
# replacing placeholder tokens with actual instance values.
#
# Usage (sourced by deploy script):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/generate-overlay.sh"
#   OVERLAY_DIR=$(generate_instance_overlay \
#     --instance "feature-my-thing" \
#     --namespace "fd34fb-prod" \
#     --cluster-domain "apps.silver.devops.gov.bc.ca" \
#     --backend-image "<artifactory-url>/kfd3-fd34fb-local/backend-services" \
#     --frontend-image "<artifactory-url>/kfd3-fd34fb-local/frontend" \
#     --worker-image "<artifactory-url>/kfd3-fd34fb-local/temporal" \
#     --image-tag "feature-my-thing")
#
# The caller is responsible for cleaning up the generated directory after use.

_GENERATE_OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_PROJECT_ROOT="$(cd "${_GENERATE_OVERLAY_DIR}/../.." && pwd)"
_TEMPLATE_DIR="${_PROJECT_ROOT}/deployments/openshift/kustomize/overlays/instance-template"

# Escape a string for use as a sed replacement value.
# Handles the delimiter (|), backslash, and ampersand.
_sed_escape_replacement() {
  printf '%s' "$1" | sed 's/[|\&]/\\&/g'
}

# generate_instance_overlay [options]
#
# Generates an instance-specific Kustomize overlay by copying the template
# and replacing placeholder tokens with provided values.
#
# Required arguments:
#   --instance <name>         Sanitized instance name (e.g., feature-my-thing)
#   --namespace <ns>          OpenShift namespace (e.g., fd34fb-prod)
#   --cluster-domain <domain> Cluster wildcard domain (e.g., apps.silver.devops.gov.bc.ca)
#   --backend-image <image>   Backend services container image (without tag)
#   --frontend-image <image>  Frontend container image (without tag)
#   --worker-image <image>    Temporal worker container image (without tag)
#   --image-tag <tag>         Image tag to use for all services
#
# Prints the path to the generated overlay directory on stdout.
# Returns 1 on error.
generate_instance_overlay() {
  local instance=""
  local namespace=""
  local cluster_domain=""
  local backend_image=""
  local frontend_image=""
  local worker_image=""
  local image_tag=""
  local sso_auth_server_url=""
  local sso_realm=""
  local sso_client_id=""
  local bootstrap_admin_email=""
  local blob_storage_provider="minio"
  local azure_storage_container_name="document-blobs"
  local benchmark_task_queue="benchmark-processing"
  local enable_benchmark_queue="true"
  local body_limit="50mb"
  local throttle_global_ttl_ms="60000"
  local throttle_global_limit="100"
  local throttle_auth_ttl_ms="60000"
  local throttle_auth_limit="10"
  local throttle_auth_refresh_ttl_ms="60000"
  local throttle_auth_refresh_limit="5"
  local azure_openai_endpoint=""
  local azure_openai_deployment=""
  local azure_openai_api_version="2024-02-15-preview"
  local enrichment_redact_pii="false"
  local azure_doc_intelligence_endpoint=""
  local azure_doc_intelligence_models="prebuilt-layout"
  local pg_backup_storage_size="10Gi"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --instance)
        instance="$2"
        shift 2
        ;;
      --namespace)
        namespace="$2"
        shift 2
        ;;
      --cluster-domain)
        cluster_domain="$2"
        shift 2
        ;;
      --backend-image)
        backend_image="$2"
        shift 2
        ;;
      --frontend-image)
        frontend_image="$2"
        shift 2
        ;;
      --worker-image)
        worker_image="$2"
        shift 2
        ;;
      --image-tag)
        image_tag="$2"
        shift 2
        ;;
      --sso-auth-server-url)
        sso_auth_server_url="$2"
        shift 2
        ;;
      --sso-realm)
        sso_realm="$2"
        shift 2
        ;;
      --sso-client-id)
        sso_client_id="$2"
        shift 2
        ;;
      --bootstrap-admin-email)
        bootstrap_admin_email="$2"
        shift 2
        ;;
      --blob-storage-provider)
        blob_storage_provider="$2"
        shift 2
        ;;
      --azure-storage-container-name)
        azure_storage_container_name="$2"
        shift 2
        ;;
      --benchmark-task-queue)
        benchmark_task_queue="$2"
        shift 2
        ;;
      --enable-benchmark-queue)
        enable_benchmark_queue="$2"
        shift 2
        ;;
      --body-limit)
        body_limit="$2"
        shift 2
        ;;
      --throttle-global-ttl-ms)
        throttle_global_ttl_ms="$2"
        shift 2
        ;;
      --throttle-global-limit)
        throttle_global_limit="$2"
        shift 2
        ;;
      --throttle-auth-ttl-ms)
        throttle_auth_ttl_ms="$2"
        shift 2
        ;;
      --throttle-auth-limit)
        throttle_auth_limit="$2"
        shift 2
        ;;
      --throttle-auth-refresh-ttl-ms)
        throttle_auth_refresh_ttl_ms="$2"
        shift 2
        ;;
      --throttle-auth-refresh-limit)
        throttle_auth_refresh_limit="$2"
        shift 2
        ;;
      --azure-openai-endpoint)
        azure_openai_endpoint="$2"
        shift 2
        ;;
      --azure-openai-deployment)
        azure_openai_deployment="$2"
        shift 2
        ;;
      --azure-openai-api-version)
        azure_openai_api_version="$2"
        shift 2
        ;;
      --enrichment-redact-pii)
        enrichment_redact_pii="$2"
        shift 2
        ;;
      --azure-doc-intelligence-endpoint)
        azure_doc_intelligence_endpoint="$2"
        shift 2
        ;;
      --azure-doc-intelligence-models)
        azure_doc_intelligence_models="$2"
        shift 2
        ;;
      --pg-backup-storage-size)
        pg_backup_storage_size="$2"
        shift 2
        ;;
      *)
        echo "[ERROR] generate_instance_overlay: unknown argument '$1'" >&2
        return 1
        ;;
    esac
  done

  # Validate required arguments
  local missing=()
  [[ -z "${instance}" ]] && missing+=("--instance")
  [[ -z "${namespace}" ]] && missing+=("--namespace")
  [[ -z "${cluster_domain}" ]] && missing+=("--cluster-domain")
  [[ -z "${backend_image}" ]] && missing+=("--backend-image")
  [[ -z "${frontend_image}" ]] && missing+=("--frontend-image")
  [[ -z "${worker_image}" ]] && missing+=("--worker-image")
  [[ -z "${image_tag}" ]] && missing+=("--image-tag")
  [[ -z "${sso_auth_server_url}" ]] && missing+=("--sso-auth-server-url")
  [[ -z "${sso_realm}" ]] && missing+=("--sso-realm")
  [[ -z "${sso_client_id}" ]] && missing+=("--sso-client-id")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[ERROR] generate_instance_overlay: missing required arguments: ${missing[*]}" >&2
    return 1
  fi

  if [[ ! -d "${_TEMPLATE_DIR}" ]]; then
    echo "[ERROR] Instance template directory not found: ${_TEMPLATE_DIR}" >&2
    return 1
  fi

  # Create a temporary directory that preserves the relative path structure
  # so that ../../base in kustomization.yml resolves correctly.
  # Structure: tmpdir/overlays/instance/ (overlay) with tmpdir/base -> symlink to real base
  local tmp_root
  tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/kustomize-${instance}-XXXXXX") || {
    echo "[ERROR] Failed to create temporary directory" >&2
    return 1
  }

  local generated_dir="${tmp_root}/overlays/instance"
  mkdir -p "${generated_dir}"

  # Copy the template into the nested overlay directory
  cp -r "${_TEMPLATE_DIR}/." "${generated_dir}/"

  # Symlink the real base directory so ../../base resolves from overlays/instance/
  local real_base="${_PROJECT_ROOT}/deployments/openshift/kustomize/base"
  ln -s "${real_base}" "${tmp_root}/base"

  # Replace all placeholder tokens in the generated overlay files
  local sed_args=(
    -e "s|__INSTANCE_NAME__|$(_sed_escape_replacement "${instance}")|g"
    -e "s|__NAMESPACE__|$(_sed_escape_replacement "${namespace}")|g"
    -e "s|__CLUSTER_DOMAIN__|$(_sed_escape_replacement "${cluster_domain}")|g"
    -e "s|__BACKEND_IMAGE__|$(_sed_escape_replacement "${backend_image}")|g"
    -e "s|__FRONTEND_IMAGE__|$(_sed_escape_replacement "${frontend_image}")|g"
    -e "s|__WORKER_IMAGE__|$(_sed_escape_replacement "${worker_image}")|g"
    -e "s|__IMAGE_TAG__|$(_sed_escape_replacement "${image_tag}")|g"
    -e "s|__SSO_AUTH_SERVER_URL__|$(_sed_escape_replacement "${sso_auth_server_url}")|g"
    -e "s|__SSO_REALM__|$(_sed_escape_replacement "${sso_realm}")|g"
    -e "s|__SSO_CLIENT_ID__|$(_sed_escape_replacement "${sso_client_id}")|g"
    -e "s|__BOOTSTRAP_ADMIN_EMAIL__|$(_sed_escape_replacement "${bootstrap_admin_email}")|g"
    -e "s|__BLOB_STORAGE_PROVIDER__|$(_sed_escape_replacement "${blob_storage_provider}")|g"
    -e "s|__AZURE_STORAGE_CONTAINER_NAME__|$(_sed_escape_replacement "${azure_storage_container_name}")|g"
    -e "s|__BENCHMARK_TASK_QUEUE__|$(_sed_escape_replacement "${benchmark_task_queue}")|g"
    -e "s|__ENABLE_BENCHMARK_QUEUE__|$(_sed_escape_replacement "${enable_benchmark_queue}")|g"
    -e "s|__BODY_LIMIT__|$(_sed_escape_replacement "${body_limit}")|g"
    -e "s|__THROTTLE_GLOBAL_TTL_MS__|$(_sed_escape_replacement "${throttle_global_ttl_ms}")|g"
    -e "s|__THROTTLE_GLOBAL_LIMIT__|$(_sed_escape_replacement "${throttle_global_limit}")|g"
    -e "s|__THROTTLE_AUTH_TTL_MS__|$(_sed_escape_replacement "${throttle_auth_ttl_ms}")|g"
    -e "s|__THROTTLE_AUTH_LIMIT__|$(_sed_escape_replacement "${throttle_auth_limit}")|g"
    -e "s|__THROTTLE_AUTH_REFRESH_TTL_MS__|$(_sed_escape_replacement "${throttle_auth_refresh_ttl_ms}")|g"
    -e "s|__THROTTLE_AUTH_REFRESH_LIMIT__|$(_sed_escape_replacement "${throttle_auth_refresh_limit}")|g"
    -e "s|__AZURE_OPENAI_ENDPOINT__|$(_sed_escape_replacement "${azure_openai_endpoint}")|g"
    -e "s|__AZURE_OPENAI_DEPLOYMENT__|$(_sed_escape_replacement "${azure_openai_deployment}")|g"
    -e "s|__AZURE_OPENAI_API_VERSION__|$(_sed_escape_replacement "${azure_openai_api_version}")|g"
    -e "s|__ENRICHMENT_REDACT_PII__|$(_sed_escape_replacement "${enrichment_redact_pii}")|g"
    -e "s|__AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT__|$(_sed_escape_replacement "${azure_doc_intelligence_endpoint}")|g"
    -e "s|__AZURE_DOC_INTELLIGENCE_MODELS__|$(_sed_escape_replacement "${azure_doc_intelligence_models}")|g"
    -e "s|__PG_BACKUP_STORAGE_SIZE__|$(_sed_escape_replacement "${pg_backup_storage_size}")|g"
  )

  # Process all YAML files in the generated directory
  find "${generated_dir}" -type f -name '*.yml' -o -name '*.yaml' | while read -r file; do
    sed -i "${sed_args[@]}" "${file}"
  done

  echo "${generated_dir}"
}

# cleanup_generated_overlay <dir>
#
# Removes a generated overlay directory created by generate_instance_overlay.
cleanup_generated_overlay() {
  local dir="$1"

  if [[ -z "${dir}" ]]; then
    return 0
  fi

  # The overlay dir is nested at tmproot/overlays/instance/.
  # Walk up to the kustomize-* temp root for cleanup.
  local cleanup_dir="${dir}"
  if [[ "${dir}" == */overlays/instance ]]; then
    cleanup_dir="${dir%/overlays/instance}"
  fi

  if [[ "${cleanup_dir}" == /tmp/* || "${cleanup_dir}" == "${TMPDIR:-/tmp}"/* ]]; then
    rm -rf "${cleanup_dir}"
  else
    echo "[WARN] Refusing to remove directory outside of /tmp: ${cleanup_dir}" >&2
    return 1
  fi
}

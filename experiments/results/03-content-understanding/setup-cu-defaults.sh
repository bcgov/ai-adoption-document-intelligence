#!/usr/bin/env bash
#
# One-time E03 setup helper: PATCH /contentunderstanding/defaults so CU
# knows which OpenAI deployments to use for its model aliases.
#
# CU's defaults call accepts two families of aliases:
#   - Direct model-name aliases: `gpt-5.2`, `text-embedding-3-large`,
#     etc. — usage telemetry uses these names.
#   - Logical aliases: `prebuilt-analyzer-completion`,
#     `prebuilt-analyzer-completion-mini`, `prebuilt-analyzer-embedding` —
#     prebuilt analyzers reference these. Custom analyzers can also
#     reference them via their `models` section.
#
# For our custom-analyzer use case we set BOTH families pointing at the
# same deployments so we don't depend on which alias the analyzer body
# happens to reference. The `*-mini` alias is left out because we don't
# deploy gpt-4.1-mini (it's only needed by prebuilt-*Search analyzers).
#
# Usage (from repo root):
#   AZURE_CU_ENDPOINT=https://<resource>.cognitiveservices.azure.com \
#   AZURE_CU_KEY=<key> \
#   ./experiments/results/03-content-understanding/setup-cu-defaults.sh
#
# Environment overrides:
#   GPT_COMPLETION_DEPLOYMENT       (default: gpt-5.2; the deployment name)
#   GPT_COMPLETION_MODEL_ALIAS      (default: gpt-5.2; CU's direct-name alias)
#   EMBEDDING_DEPLOYMENT            (default: text-embedding-3-large)
#   GPT_MINI_DEPLOYMENT             (optional; if set, also wires the
#                                    prebuilt-analyzer-completion-mini alias)

set -euo pipefail

if [[ -z "${AZURE_CU_ENDPOINT:-}" || -z "${AZURE_CU_KEY:-}" ]]; then
  echo "❌ AZURE_CU_ENDPOINT and AZURE_CU_KEY must be set." >&2
  exit 1
fi

GPT_COMPLETION_DEPLOYMENT="${GPT_COMPLETION_DEPLOYMENT:-gpt-5.2}"
GPT_COMPLETION_MODEL_ALIAS="${GPT_COMPLETION_MODEL_ALIAS:-gpt-5.2}"
EMBEDDING_DEPLOYMENT="${EMBEDDING_DEPLOYMENT:-text-embedding-3-large}"

URL="${AZURE_CU_ENDPOINT%/}/contentunderstanding/defaults?api-version=2025-11-01"

# Build the modelDeployments object. We always wire:
#   - the direct model-name alias (e.g. "gpt-5.2") for usage telemetry
#   - "text-embedding-3-large" likewise
#   - the logical aliases prebuilt analyzers reference
# If GPT_MINI_DEPLOYMENT is set, we additionally wire the *-mini alias.
mini_line=""
if [[ -n "${GPT_MINI_DEPLOYMENT:-}" ]]; then
  mini_line=$'\n    "gpt-4.1-mini": "'"${GPT_MINI_DEPLOYMENT}"$'",\n    "prebuilt-analyzer-completion-mini": "'"${GPT_MINI_DEPLOYMENT}"$'",'
fi

body=$(cat <<EOF
{
  "modelDeployments": {
    "${GPT_COMPLETION_MODEL_ALIAS}": "${GPT_COMPLETION_DEPLOYMENT}",
    "text-embedding-3-large": "${EMBEDDING_DEPLOYMENT}",${mini_line}
    "prebuilt-analyzer-completion": "${GPT_COMPLETION_DEPLOYMENT}",
    "prebuilt-analyzer-embedding": "${EMBEDDING_DEPLOYMENT}"
  }
}
EOF
)

echo "→ PATCH ${URL}"
echo "  ${GPT_COMPLETION_MODEL_ALIAS}            = ${GPT_COMPLETION_DEPLOYMENT}"
echo "  text-embedding-3-large = ${EMBEDDING_DEPLOYMENT}"
if [[ -n "${GPT_MINI_DEPLOYMENT:-}" ]]; then
  echo "  gpt-4.1-mini           = ${GPT_MINI_DEPLOYMENT}"
fi
echo "  prebuilt-analyzer-completion = ${GPT_COMPLETION_DEPLOYMENT}"
echo "  prebuilt-analyzer-embedding  = ${EMBEDDING_DEPLOYMENT}"

status=$(curl -s -o /tmp/cu-defaults-resp.json -w "%{http_code}" \
  -X PATCH "${URL}" \
  -H "Ocp-Apim-Subscription-Key: ${AZURE_CU_KEY}" \
  -H "Content-Type: application/json" \
  -d "${body}")

if [[ "$status" =~ ^2 ]]; then
  echo "✓ CU defaults updated (HTTP ${status})"
  cat /tmp/cu-defaults-resp.json | python3 -m json.tool 2>/dev/null || cat /tmp/cu-defaults-resp.json
else
  echo "✗ CU defaults PATCH failed: HTTP ${status}" >&2
  cat /tmp/cu-defaults-resp.json >&2
  exit 1
fi

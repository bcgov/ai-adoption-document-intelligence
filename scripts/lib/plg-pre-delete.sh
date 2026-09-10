#!/usr/bin/env bash
#
# plg-pre-delete.sh — Delete immutable PLG StatefulSets before Helm upgrade.
#
# StatefulSet volumeClaimTemplates are immutable. Deleting with --cascade=orphan
# preserves PVCs and running pods while allowing Helm to recreate the StatefulSet.
#

# delete_plg_statefulsets_for_upgrade <namespace> <instance-name>
delete_plg_statefulsets_for_upgrade() {
  local namespace="$1"
  local instance="$2"
  local plg_release="${instance}-plg"
  local ss

  for ss in loki prometheus alertmanager; do
    local ss_name="${plg_release}-${ss}"
    if oc get statefulset "${ss_name}" -n "${namespace}" &>/dev/null; then
      echo "[INFO] Deleting StatefulSet ${ss_name} for clean upgrade (--cascade=orphan)..."
      oc delete statefulset "${ss_name}" -n "${namespace}" --cascade=orphan
    fi
  done
}

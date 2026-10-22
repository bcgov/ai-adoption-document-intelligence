#!/usr/bin/env bash
#
# in-use-image-tags.sh — the Artifactory image tags a namespace refers to.
#
# in_use_image_tags <namespace> prints, one per line and sorted, the tag of
# every image from the kfd3-fd34fb-local repository that a Pod, Deployment,
# StatefulSet, Job or CronJob in the namespace names, init containers included.
# Pods count as well as their controllers, so a rollout caught halfway keeps
# both builds, and so do workloads deployed outside the instance overlay (the
# PLG stack's CHES adapter). An image named only by digest has no tag to keep
# and is skipped.
#
# When the cluster cannot be read it prints nothing and returns 1, so a caller
# never mistakes a failed lookup for "nothing is in use". Source
# scripts/lib/oc-retry.sh first to retry connection errors.
#

in_use_image_tags() {
  local namespace="$1"
  local json
  json=$(oc get pods,deployments,statefulsets,jobs,cronjobs -n "${namespace}" -o json) || return 1
  printf '%s' "${json}" | python3 -c '
import json
import sys

REPO = "/kfd3-fd34fb-local/"
tags = set()


def walk(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "image" and isinstance(value, str):
                ref = value.split("@", 1)[0]
                if REPO in ref:
                    name = ref.rsplit("/", 1)[-1]
                    if ":" in name:
                        tags.add(name.split(":", 1)[1])
            else:
                walk(value)
    elif isinstance(node, list):
        for value in node:
            walk(value)


for item in json.load(sys.stdin).get("items", []):
    walk(item.get("spec", {}))
for tag in sorted(tags):
    print(tag)
'
}

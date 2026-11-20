import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseAllDocuments } from "yaml";

const root = new URL("..", import.meta.url).pathname;

/**
 * Renders manifests without contacting a cluster.
 * @param {string} command Rendering command.
 * @param {string[]} args Command arguments.
 * @returns {object[]} Parsed resources.
 */
function render(command, args) {
  return parseAllDocuments(
    execFileSync(command, args, { cwd: root, encoding: "utf8" }),
  ).map((doc) => doc.toJSON());
}

/**
 * Checks least-privilege log access and per-pod buffering.
 * @param {object} deployment Rendered deployment.
 * @param {string} prefix Instance prefix.
 * @returns {void}
 */
function checkSidecar(deployment, prefix) {
  const pod = deployment.spec.template.spec;
  assert.ok(pod.containers.some((container) => container.name === "promtail"));
  const mirror = pod.containers.find(
    (container) => container.name === "fluent-bit",
  );
  assert.equal(mirror.image, "fluent/fluent-bit:4.0.3");
  assert.deepEqual(mirror.envFrom, [
    { secretRef: { name: `${prefix}azure-logs-secrets` } },
  ]);
  assert.equal(mirror.securityContext.runAsNonRoot, true);
  assert.equal(mirror.securityContext.readOnlyRootFilesystem, true);
  assert.equal(mirror.securityContext.allowPrivilegeEscalation, false);
  assert.deepEqual(mirror.securityContext.capabilities.drop, ["ALL"]);
  assert.ok(
    mirror.volumeMounts.some(
      (mount) => mount.name === "logs" && mount.readOnly === true,
    ),
  );
  assert.deepEqual(
    pod.volumes.find((volume) => volume.name === "fluent-bit-data").emptyDir,
    { sizeLimit: "128Mi" },
  );
  assert.equal(
    pod.volumes.find((volume) => volume.name === "fluent-bit-config").configMap
      .name,
    `${prefix}fluent-bit-config`,
  );
  assert.equal(mirror.livenessProbe.httpGet.path, "/api/v1/uptime");
}

test("Kustomize base and instance overlays mirror existing log volumes", () => {
  for (const [overlay, prefix] of [
    ["base", ""],
    ["overlays/instance-template", "__INSTANCE_NAME__-"],
  ]) {
    const docs = render("kubectl", [
      "kustomize",
      `deployments/openshift/kustomize/${overlay}`,
    ]);
    const config = docs.find(
      (doc) => doc.metadata.name === `${prefix}fluent-bit-config`,
    );
    assert.equal(
      config.data["filters.lua"],
      readFileSync(join(root, "deployments/fluent-bit/filters.lua"), "utf8"),
    );
    for (const service of [
      "backend-services",
      "frontend",
      "temporal",
      "temporal-worker",
    ]) {
      const deployment = docs.find(
        (doc) =>
          doc.kind === "Deployment" &&
          doc.metadata.name === `${prefix}${service}`,
      );
      checkSidecar(deployment, prefix);
      const mirror = deployment.spec.template.spec.containers.find(
        (container) => container.name === "fluent-bit",
      );
      assert.equal(
        mirror.env.find((env) => env.name === "LOG_FILTER").value,
        service === "frontend" ? "nginx" : "structured",
      );
    }
  }
});

test("CHES Helm sidecar references the same instance configuration", () => {
  const docs = render("helm", [
    "template",
    "mirror-test-plg",
    "deployments/openshift/helm/plg",
    "-f",
    "deployments/openshift/helm/plg/values-openshift.yaml",
    "--set",
    "alertmanager.notificationsEnabled=true",
    "--set",
    "azureLogs.secretName=mirror-test-azure-logs-secrets",
    "--set",
    "azureLogs.configMapName=mirror-test-fluent-bit-config",
  ]);
  const adapter = docs.find(
    (doc) =>
      doc.kind === "Deployment" &&
      doc.metadata.name === "mirror-test-plg-ches-adapter",
  );
  checkSidecar(adapter, "mirror-test-");
});

test("the manual/CI overlay generator keeps mirror resources instance-scoped", () => {
  const docs = render("bash", [
    "-c",
    `set -euo pipefail
source scripts/lib/generate-overlay.sh
overlay=$(generate_instance_overlay --instance mirror-test --namespace test-ns \\
  --cluster-domain apps.example.invalid --backend-image example.invalid/backend \\
  --frontend-image example.invalid/frontend --worker-image example.invalid/worker \\
  --image-tag test --sso-auth-server-url https://sso.example.invalid \\
  --sso-realm test --sso-client-id test)
trap 'cleanup_generated_overlay "$overlay"' EXIT
kubectl kustomize "$overlay"`,
  ]);
  const deployments = docs.filter(
    (doc) =>
      doc.kind === "Deployment" &&
      doc.spec.template.spec.containers.some(
        (container) => container.name === "fluent-bit",
      ),
  );
  assert.equal(deployments.length, 4);
  for (const deployment of deployments) {
    checkSidecar(deployment, "mirror-test-");
  }
});

test("real non-root Fluent Bit tails, filters, and decorates each OpenShift source", () => {
  const temp = mkdtempSync(join(tmpdir(), "fluent-bit-test-"));
  try {
    mkdirSync(join(temp, "logs"));
    chmodSync(join(temp, "logs"), 0o755);
    const config = readFileSync(
      join(root, "deployments/fluent-bit/openshift.yaml"),
      "utf8",
    )
      .split("  outputs:")[0]
      .replace("  flush: 5", "  flush: 1\n  grace: 1")
      .replace("      refresh_interval: 5", "      exit_on_eof: true")
      .concat(
        "  outputs:\n    - name: stdout\n      match: app.*\n      format: json_lines\n",
      );
    writeFileSync(join(temp, "stdout.yaml"), config, { mode: 0o644 });
    const structured = [
      '{"level":"info","message":"drop-success","statusCode":200}',
      '{"level":"info","message":"keep-http","statusCode":403}',
      '{"level":"warn","message":"keep-warning"}',
    ];
    for (const [service, filter, lines, count] of [
      ["backend-services", "structured", structured, 2],
      ["temporal-worker", "structured", structured, 2],
      ["temporal-server", "structured", structured, 2],
      [
        "frontend",
        "frontend",
        [
          "VITE v6 startup banner",
          "hmr update /test.ts",
          "Error: address already in use",
          "Warning: dependency warning",
        ],
        2,
      ],
      [
        "frontend",
        "nginx",
        [
          '127.0.0.1 - - [now] "GET / HTTP/1.1" 200 512 "-" "kube-probe/1"',
          '127.0.0.1 - - [now] "GET /missing HTTP/1.1" 404 512 "-" "test"',
          '127.0.0.1 - - [now] "GET /api/test HTTP/1.1" 502 512 "-" "test"',
          "2026/11/17 12:00:00 [error] 1#1: upstream connection refused",
          "2026/11/17 12:00:00 [notice] 1#1: worker started",
        ],
        3,
      ],
      ["ches-adapter", "passthrough", ["adapter delivery", ""], 1],
    ]) {
      writeFileSync(join(temp, "logs", "test.log"), `${lines.join("\n")}\n`, {
        mode: 0o644,
      });
      const output = execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "--network=none",
          "--user=1000670000:0",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--tmpfs=/var/lib/fluent-bit:uid=1000670000,gid=0,mode=0770",
          "-v",
          `${root}/deployments/fluent-bit:/fluent-bit/etc:ro`,
          "-v",
          `${temp}/stdout.yaml:/test.yaml:ro`,
          "-v",
          `${temp}/logs:/var/log/app:ro`,
          "-e",
          `LOG_SERVICE=${service}`,
          "-e",
          `LOG_FILTER=${filter}`,
          "-e",
          "LOG_PROJECT=test-namespace",
          "fluent/fluent-bit:4.0.3",
          "/fluent-bit/bin/fluent-bit",
          "--config=/test.yaml",
        ],
        { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] },
      );
      const rows = output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      assert.equal(rows.length, count, `${service}: ${output}`);
      for (const row of rows) {
        assert.equal(row.Service, service);
        assert.equal(row.Project, "test-namespace");
      }
      if (filter === "nginx") {
        assert.equal(rows[0].StatusCode, 404);
        assert.equal(rows[0].Level, "warn");
        assert.equal(rows[1].StatusCode, 502);
        assert.equal(rows[1].Level, "error");
        assert.equal(rows[2].Level, "error");
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("production Azure output and health endpoint run with OpenShift-style permissions", async () => {
  const name = `copilot-fluent-bit-test-${process.pid}`;
  const temp = mkdtempSync(join(tmpdir(), "fluent-bit-startup-"));
  chmodSync(temp, 0o755);
  let started = false;
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--user=1000670000:0",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--tmpfs=/var/lib/fluent-bit:uid=1000670000,gid=0,mode=0770",
        "--publish=127.0.0.1::2020",
        "-v",
        `${root}/deployments/fluent-bit:/fluent-bit/etc:ro`,
        "-v",
        `${temp}:/var/log/app:ro`,
        "-e",
        "LOG_SERVICE=backend-services",
        "-e",
        "LOG_FILTER=structured",
        "-e",
        "LOG_PROJECT=test-namespace",
        "-e",
        "AZURE_LOGS_TENANT_ID=test-tenant",
        "-e",
        "AZURE_LOGS_CLIENT_ID=test-client",
        "-e",
        "AZURE_LOGS_CLIENT_SECRET=test-secret",
        "-e",
        "AZURE_LOGS_DCE_URL=https://test.example.invalid",
        "-e",
        "AZURE_LOGS_DCR_ID=dcr-test",
        "-e",
        "AZURE_LOGS_TABLE_NAME=Test_CL",
        "fluent/fluent-bit:4.0.3",
        "/fluent-bit/bin/fluent-bit",
        "--config=/fluent-bit/etc/openshift.yaml",
      ],
      { encoding: "utf8" },
    );
    started = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const address = execFileSync("docker", ["port", name, "2020/tcp"], {
      encoding: "utf8",
    }).trim();
    const response = await fetch(`http://${address}/api/v1/uptime`);
    assert.equal(response.status, 200);
    const inspection = JSON.parse(
      execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
    )[0];
    assert.equal(inspection.State.Running, true);
  } finally {
    if (started) {
      execFileSync("docker", ["stop", "--timeout=10", name], {
        stdio: "ignore",
      });
    }
    rmSync(temp, { recursive: true, force: true });
  }
});

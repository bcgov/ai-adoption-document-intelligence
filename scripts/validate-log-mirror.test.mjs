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

/**
 * Rendered Deployments that carry the mirror sidecar.
 * @param {object[]} docs Rendered resources.
 * @returns {object[]} Deployments with a fluent-bit container.
 */
function mirrored(docs) {
  return docs.filter(
    (doc) =>
      doc.kind === "Deployment" &&
      doc.spec.template.spec.containers.some(
        (container) => container.name === "fluent-bit",
      ),
  );
}

/**
 * Renders a generated instance overlay the way both deploy paths build it.
 * @param {string[]} flags Extra generate_instance_overlay flags.
 * @returns {object[]} Parsed resources.
 */
function renderInstance(flags) {
  return render("bash", [
    "-c",
    `set -euo pipefail
source scripts/lib/generate-overlay.sh
overlay=$(generate_instance_overlay --instance mirror-test --namespace test-ns \\
  --cluster-domain apps.example.invalid --backend-image example.invalid/backend \\
  --frontend-image example.invalid/frontend --worker-image example.invalid/worker \\
  --image-tag test --sso-auth-server-url https://sso.example.invalid \\
  --sso-realm test --sso-client-id test ${flags.join(" ")})
trap 'cleanup_generated_overlay "$overlay"' EXIT
kubectl kustomize "$overlay"`,
  ]);
}

test("Kustomize base and instance template deploy no mirror", () => {
  for (const overlay of ["base", "overlays/instance-template"]) {
    const docs = render("kubectl", [
      "kustomize",
      `deployments/openshift/kustomize/${overlay}`,
    ]);
    assert.deepEqual(mirrored(docs), [], overlay);
    assert.ok(
      !docs.some((doc) => doc.metadata.name.endsWith("fluent-bit-config")),
      overlay,
    );
  }
});

test("the overlay generator adds the mirror only with --with-azure-log-mirror", () => {
  const without = renderInstance([]);
  assert.deepEqual(mirrored(without), []);
  assert.ok(
    !without.some(
      (doc) => doc.metadata.name === "mirror-test-fluent-bit-config",
    ),
  );

  const docs = renderInstance(["--with-azure-log-mirror"]);
  const config = docs.find(
    (doc) => doc.metadata.name === "mirror-test-fluent-bit-config",
  );
  assert.equal(
    config.data["filters.lua"],
    readFileSync(join(root, "deployments/fluent-bit/filters.lua"), "utf8"),
  );
  assert.equal(
    config.data["fluent-bit.yaml"],
    readFileSync(join(root, "deployments/fluent-bit/openshift.yaml"), "utf8"),
  );
  const deployments = mirrored(docs);
  assert.deepEqual(
    deployments.map((deployment) => deployment.metadata.name).sort(),
    ["backend-services", "frontend", "temporal", "temporal-worker"].map(
      (service) => `mirror-test-${service}`,
    ),
  );
  for (const deployment of deployments) {
    checkSidecar(deployment, "mirror-test-");
    const env = deployment.spec.template.spec.containers.find(
      (container) => container.name === "fluent-bit",
    ).env;
    const setting = (name) => env.find((entry) => entry.name === name);
    const service = deployment.metadata.name.replace("mirror-test-", "");
    assert.equal(
      setting("LOG_FILTER").value,
      service === "frontend" ? "nginx" : "structured",
    );
    if (service === "temporal") {
      assert.equal(setting("LOG_SERVICE").value, "temporal-server");
      assert.equal(setting("LOG_SERVICE").valueFrom, undefined);
    }
  }
});

test("CHES Helm sidecar is off by default and instance-scoped when enabled", () => {
  const adapter = (...values) =>
    render("helm", [
      "template",
      "mirror-test-plg",
      "deployments/openshift/helm/plg",
      "-f",
      "deployments/openshift/helm/plg/values-openshift.yaml",
      "--set",
      "alertmanager.notificationsEnabled=true",
      ...values.flatMap((value) => ["--set", value]),
    ]).find(
      (doc) =>
        doc.kind === "Deployment" &&
        doc.metadata.name === "mirror-test-plg-ches-adapter",
    );

  const off = adapter();
  assert.deepEqual(mirrored([off]), []);
  assert.equal(
    off.spec.template.spec.volumes.some((volume) =>
      volume.name.startsWith("fluent-bit"),
    ),
    false,
  );
  assert.equal(off.spec.template.metadata.annotations, undefined);

  checkSidecar(
    adapter(
      "azureLogs.enabled=true",
      "azureLogs.secretName=mirror-test-azure-logs-secrets",
      "azureLogs.configMapName=mirror-test-fluent-bit-config",
    ),
    "mirror-test-",
  );
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
    // Request-context fields as AppLoggerService merges them into a backend line.
    const failed = {
      timestamp: "2026-11-25T10:00:00.000Z",
      level: "warn",
      message: "Request failed",
      requestId: "req-1",
      actorId: "actor-1",
      userId: "user-1",
      sessionId: "session-1",
      apiKeyId: "key-1",
      clientIp: "203.0.113.24",
      path: "/api/documents/1",
      statusCode: 404,
      context: { userId: "nested-user", note: 'quote " and back\\slash' },
    };
    const structured = [
      '{"level":"info","message":"drop-success","statusCode":200}',
      '{"level":"info","message":"keep-http","statusCode":403}',
      '{"level":"warn","message":"keep-warning"}',
      JSON.stringify(failed),
      'Error: request failed {"clientIp":"203.0.113.25","userId":"user-2"',
    ];
    const withoutIdentity = JSON.stringify({
      timestamp: failed.timestamp,
      level: failed.level,
      message: failed.message,
      requestId: failed.requestId,
      path: failed.path,
      statusCode: failed.statusCode,
      context: { note: failed.context.note },
    });
    // Values that identify a person and must never reach RawData.
    const identifying = [
      "203.0.113",
      "actor-1",
      "user-1",
      "user-2",
      "nested-user",
      "session-1",
      "key-1",
      "test-agent",
      "ref.example",
      "token=",
    ];
    for (const [service, filter, lines, count] of [
      ["backend-services", "structured", structured, 4],
      ["temporal-worker", "structured", structured, 4],
      ["temporal-server", "structured", structured, 4],
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
          '10.97.4.1 - - [now] "GET / HTTP/1.1" 200 512 "-" "kube-probe/1" "-"',
          '10.97.4.1 - - [now] "GET /missing?token=abc HTTP/1.1" 404 512 "https://ref.example/page" "test-agent" "203.0.113.24"',
          '10.97.4.1 - - [now] "GET /api/test HTTP/1.1" 502 512 "-" "test-agent" "203.0.113.24"',
          '10.97.4.1 - - [now] "GET /search?q=[error] HTTP/1.1" 200 512 "-" "test-agent" "203.0.113.24"',
          '2026/11/17 12:00:00 [error] 1#1: *5 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.24, server: , request: "POST /api/upload?token=abc HTTP/1.1", upstream: "http://10.0.0.2:3002/api/upload?token=abc", host: "app.example", referrer: "https://ref.example/upload"',
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
        for (const value of identifying) {
          assert.ok(!row.RawData.includes(value), `${service}: ${row.RawData}`);
        }
      }
      if (filter === "structured") {
        const sent = rows.map((row) => row.RawData);
        assert.ok(sent.includes(withoutIdentity), sent.join("\n"));
        assert.ok(
          sent.includes(
            'Error: request failed {"clientIp":"[removed]","userId":"[removed]"',
          ),
          sent.join("\n"),
        );
      }
      if (filter === "nginx") {
        assert.equal(rows[0].StatusCode, 404);
        assert.equal(rows[0].Level, "warn");
        assert.equal(rows[0].RawData, "GET /missing 404");
        assert.equal(rows[1].StatusCode, 502);
        assert.equal(rows[1].Level, "error");
        assert.equal(rows[1].RawData, "GET /api/test 502");
        assert.equal(rows[2].Level, "error");
        assert.equal(
          rows[2].RawData,
          '2026/11/17 12:00:00 [error] 1#1: *5 connect() failed (111: Connection refused) while connecting to upstream, server: , request: "POST /api/upload HTTP/1.1", upstream: "http://10.0.0.2:3002/api/upload", host: "app.example"',
        );
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

/**
 * Blob/object storage pressure through classifier document storage APIs.
 * Requires an existing classifier name in LOAD_TEST_BLOB_CLASSIFIER_NAME.
 * Uses generated, license-clear binary payloads by default; size tiers must
 * stay below the backend BODY_LIMIT for each multipart request.
 */
// biome-ignore-all lint/correctness/noUndeclaredVariables: k6 provides __ENV, __ITER, __VU, and open at runtime.
/* global __ENV, __ITER, __VU, open */

import { FormData } from "https://jslib.k6.io/formdata/0.0.2/index.js";
import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";
const classifierName = __ENV.LOAD_TEST_BLOB_CLASSIFIER_NAME || "";
const vus = Number(__ENV.LOAD_TEST_VUS || "1");
const duration = __ENV.LOAD_TEST_DURATION || "60s";
const sleepSeconds = Number(__ENV.LOAD_TEST_SLEEP_SECONDS || "1");
const filesPerIteration = Number(__ENV.LOAD_TEST_BLOB_FILES_PER_ITER || "1");
const cleanupEnabled = (__ENV.LOAD_TEST_BLOB_CLEANUP || "true") !== "false";
const deleteBeforeRun = __ENV.LOAD_TEST_BLOB_DELETE_BEFORE_RUN === "true";
const runId = __ENV.LOAD_TEST_RUN_ID || `k6-blob-${Date.now()}`;
const runLabel = sanitizeLabel(__ENV.LOAD_TEST_BLOB_LABEL || runId);
const bodyLimitBytes = parseSizeToBytes(
  __ENV.LOAD_TEST_BODY_LIMIT || __ENV.BODY_LIMIT || "50mb",
  "LOAD_TEST_BODY_LIMIT",
);
const payloadTier = normalizeTier(__ENV.LOAD_TEST_PAYLOAD_SIZE_TIER || "small");
const blobFilePath = __ENV.LOAD_TEST_BLOB_FILE_PATH || "";
const payloadBytes = resolvePayloadBytes("LOAD_TEST_BLOB_PAYLOAD_BYTES");

export const blobUploadSuccess = new Rate("blob_upload_success");
export const blobListSuccess = new Rate("blob_list_success");
export const blobCleanupSuccess = new Rate("blob_cleanup_success");
export const blobUploadDuration = new Trend("blob_upload_duration");
export const blobListDuration = new Trend("blob_list_duration");
export const blobCleanupDuration = new Trend("blob_cleanup_duration");

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<60000"],
    blob_upload_success: ["rate>0.95"],
    blob_list_success: ["rate>0.95"],
  },
};

const payload = blobFilePath
  ? open(blobFilePath, "b")
  : buildSyntheticBinary(payloadBytes);
const actualPayloadBytes = estimateRawBytes(payload);

function sanitizeLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeTier(value) {
  const tier = value.toLowerCase();
  if (!["small", "medium", "large"].includes(tier)) {
    throw new Error(
      "LOAD_TEST_PAYLOAD_SIZE_TIER must be one of: small, medium, large.",
    );
  }
  return tier;
}

function parseSizeToBytes(value, variableName) {
  const match = String(value)
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|kib|mib|gib)?$/);
  if (!match) {
    throw new Error(
      `${variableName} must be a byte count or size string such as 1048576, 10mb, or 10MiB.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] || "b";
  const multipliers = {
    b: 1,
    kb: 1000,
    mb: 1000 * 1000,
    gb: 1000 * 1000 * 1000,
    kib: 1024,
    mib: 1024 * 1024,
    gib: 1024 * 1024 * 1024,
  };
  return Math.floor(amount * multipliers[unit]);
}

function resolvePayloadBytes(exactVariableName) {
  const exact = __ENV[exactVariableName] || __ENV.LOAD_TEST_PAYLOAD_BYTES;
  if (exact) {
    return parseSizeToBytes(exact, exactVariableName);
  }

  const tierVariableName = `LOAD_TEST_PAYLOAD_${payloadTier.toUpperCase()}_BYTES`;
  const defaultBytesByTier = {
    small: 256 * 1024,
    medium: 1024 * 1024,
    large: 5 * 1024 * 1024,
  };

  return __ENV[tierVariableName]
    ? parseSizeToBytes(__ENV[tierVariableName], tierVariableName)
    : defaultBytesByTier[payloadTier];
}

function buildSyntheticBinary(size) {
  if (!Number.isFinite(size) || size < 1) {
    throw new Error("LOAD_TEST_BLOB_PAYLOAD_BYTES must be a positive number.");
  }

  const chunk = "0123456789abcdefghijklmnopqrstuvwxyz".repeat(29);
  let value = "";
  while (value.length < size) {
    value += chunk;
  }
  return value.slice(0, size);
}

function estimateRawBytes(value) {
  return typeof value === "string" ? value.length : value.byteLength;
}

function assertWithinBodyLimit() {
  const multipartBytes = actualPayloadBytes * filesPerIteration + 4096;
  if (multipartBytes > bodyLimitBytes) {
    throw new Error(
      `Selected blob multipart request is approximately ${multipartBytes} bytes, which exceeds BODY_LIMIT ${bodyLimitBytes}. Lower the tier bytes/files per iteration or raise BODY_LIMIT only in a disposable environment.`,
    );
  }
}

function authHeaders() {
  return {
    "x-api-key": apiKey,
  };
}

function documentsUrl() {
  const group = encodeURIComponent(groupId);
  const name = encodeURIComponent(classifierName);
  return `${baseUrl}/api/azure/classifier/documents?group_id=${group}&name=${name}`;
}

function deleteUrl() {
  const group = encodeURIComponent(groupId);
  const name = encodeURIComponent(classifierName);
  const folder = encodeURIComponent(runLabel);
  return `${baseUrl}/api/azure/classifier/documents?group_id=${group}&name=${name}&folder=${folder}`;
}

/**
 * Nest `FilesInterceptor("files")` expects one or more multipart parts named `files`.
 * A plain object with `files: [http.file(...)]` is serialized as
 * application/x-www-form-urlencoded by k6, which yields 500 from the backend.
 * Use FormData with repeated `append("files", ...)` instead.
 */
function buildClassifierDocumentsMultipart() {
  const fd = new FormData();
  fd.append("name", classifierName);
  fd.append("label", runLabel);
  for (let index = 0; index < filesPerIteration; index += 1) {
    const filename = `${runLabel}-vu${__VU}-iter${__ITER}-file${index}.bin`;
    fd.append(
      "files",
      http.file(payload, filename, "application/octet-stream"),
    );
  }
  return {
    body: fd.body(),
    headers: {
      ...authHeaders(),
      "Content-Type": `multipart/form-data; boundary=${fd.boundary}`,
    },
  };
}

function deleteRunPrefix() {
  const res = http.del(deleteUrl(), null, {
    headers: authHeaders(),
    timeout: "120s",
  });
  const success = res.status === 204 || res.status === 404;
  blobCleanupSuccess.add(success);
  blobCleanupDuration.add(res.timings.duration);
  return res;
}

export default function () {
  const { body, headers } = buildClassifierDocumentsMultipart();
  const uploadRes = http.post(documentsUrl(), body, {
    headers,
    timeout: "120s",
  });
  const uploaded = check(uploadRes, {
    "upload status 201": (res) => res.status === 201,
    "uploaded requested file count": (res) =>
      res.json("fileCount") === filesPerIteration,
  });
  blobUploadSuccess.add(uploaded);
  blobUploadDuration.add(uploadRes.timings.duration);

  const listRes = http.get(documentsUrl(), {
    headers: authHeaders(),
    timeout: "120s",
  });
  const listed = check(listRes, {
    "list status 200": (res) => res.status === 200,
    "run label present": (res) =>
      typeof res.body === "string" && res.body.includes(`/${runLabel}/`),
  });
  blobListSuccess.add(listed);
  blobListDuration.add(listRes.timings.duration);

  sleep(sleepSeconds);
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
  if (!groupId) {
    throw new Error("Set LOAD_TEST_GROUP_ID to the disposable target group.");
  }
  if (!classifierName) {
    throw new Error(
      "Set LOAD_TEST_BLOB_CLASSIFIER_NAME to an existing classifier in the target group.",
    );
  }
  if (!runLabel) {
    throw new Error(
      "LOAD_TEST_BLOB_LABEL or LOAD_TEST_RUN_ID produced an empty label.",
    );
  }
  if (!Number.isInteger(filesPerIteration) || filesPerIteration < 1) {
    throw new Error(
      "LOAD_TEST_BLOB_FILES_PER_ITER must be a positive integer.",
    );
  }
  assertWithinBodyLimit();

  if (deleteBeforeRun) {
    deleteRunPrefix();
  }
}

export function teardown() {
  if (cleanupEnabled) {
    deleteRunPrefix();
  }
}

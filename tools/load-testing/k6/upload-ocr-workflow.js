/**
 * POST /api/upload throughput scenario for OCR / Temporal workflow enqueue.
 * Requires an existing WorkflowVersion.id in LOAD_TEST_WORKFLOW_VERSION_ID.
 * Uses generated, license-clear PDF payloads by default; size tiers must stay
 * below the backend BODY_LIMIT after base64 JSON expansion.
 */
// biome-ignore-all lint/correctness/noUndeclaredVariables: k6 provides __ENV, __VU, __ITER, and open at runtime.
/* global __ENV, __ITER, __VU, open */

import { check, sleep } from "k6";
import encoding from "k6/encoding";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";
const workflowVersionId = __ENV.LOAD_TEST_WORKFLOW_VERSION_ID || "";
const modelId = __ENV.LOAD_TEST_MODEL_ID || "prebuilt-layout";
const vus = Number(__ENV.LOAD_TEST_VUS || "1");
const duration = __ENV.LOAD_TEST_DURATION || "60s";
const sleepSeconds = Number(__ENV.LOAD_TEST_SLEEP_SECONDS || "1");
const runId = __ENV.LOAD_TEST_RUN_ID || `k6-upload-ocr-${Date.now()}`;
const bodyLimitBytes = parseSizeToBytes(
  __ENV.LOAD_TEST_BODY_LIMIT || __ENV.BODY_LIMIT || "50mb",
  "LOAD_TEST_BODY_LIMIT",
);
const payloadTier = normalizeTier(__ENV.LOAD_TEST_PAYLOAD_SIZE_TIER || "small");
const uploadFilePath = __ENV.LOAD_TEST_UPLOAD_FILE_PATH || "";
const uploadFileBase64 = __ENV.LOAD_TEST_UPLOAD_FILE_BASE64 || "";
const uploadPayloadBytes = resolvePayloadBytes(
  "LOAD_TEST_UPLOAD_PAYLOAD_BYTES",
);
const uploadPayload = uploadFileBase64
  ? ""
  : uploadFilePath
    ? open(uploadFilePath, "b")
    : buildSyntheticPdf(uploadPayloadBytes);
const uploadPayloadRawBytes = uploadFileBase64
  ? estimateBase64RawBytes(uploadFileBase64)
  : estimateRawBytes(uploadPayload);
const uploadPayloadBase64 =
  uploadFileBase64 || encoding.b64encode(uploadPayload, "std");
const uploadPayloadSource = uploadFileBase64
  ? "base64-env"
  : uploadFilePath
    ? "file-path"
    : "generated-pdf";

export const uploadSuccess = new Rate("upload_success");
export const uploadCreatedDuration = new Trend("upload_created_duration");

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<30000"],
    upload_success: ["rate>0.95"],
  },
};

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
  const exact = __ENV[exactVariableName];
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

function buildSyntheticPdf(targetBytes) {
  if (!Number.isInteger(targetBytes) || targetBytes < 1) {
    throw new Error("Upload payload size must be a positive integer.");
  }

  function render(fillerLength) {
    const filler =
      fillerLength > 0 ? `\n%${"x".repeat(Math.max(0, fillerLength - 2))}` : "";
    const contentStream = `BT /F1 12 Tf 72 720 Td (Synthetic load-test document) Tj ET${filler}`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (const offset of offsets.slice(1)) {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
    return pdf;
  }

  const minimumPdf = render(0);
  if (targetBytes < minimumPdf.length) {
    throw new Error(
      `Requested upload payload size ${targetBytes} bytes is smaller than the generated PDF minimum ${minimumPdf.length} bytes.`,
    );
  }

  let fillerLength = targetBytes - minimumPdf.length;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pdf = render(fillerLength);
    const diff = targetBytes - pdf.length;
    if (diff === 0) {
      return pdf;
    }
    fillerLength += diff;
  }

  const pdf = render(fillerLength);
  if (pdf.length !== targetBytes) {
    throw new Error(
      "Could not generate a synthetic PDF at the requested size.",
    );
  }
  return pdf;
}

function estimateRawBytes(value) {
  return typeof value === "string" ? value.length : value.byteLength;
}

function estimateBase64RawBytes(value) {
  const trimmed = String(value).replace(/^data:[^;]+;base64,/, "");
  return Math.floor((trimmed.length * 3) / 4);
}

function assertWithinBodyLimit() {
  const jsonBodyBytes = Math.ceil(uploadPayloadRawBytes / 3) * 4 + 2048;
  if (jsonBodyBytes > bodyLimitBytes) {
    throw new Error(
      `Selected upload payload is approximately ${jsonBodyBytes} JSON bytes, which exceeds BODY_LIMIT ${bodyLimitBytes}. Lower the tier bytes or raise BODY_LIMIT only in a disposable environment.`,
    );
  }
}

function buildUploadPayload() {
  const documentToken = `${runId}-vu${__VU}-iter${__ITER}`;
  return {
    title: documentToken,
    file: uploadPayloadBase64,
    file_type: "pdf",
    original_filename: `${documentToken}.pdf`,
    metadata: {
      loadTest: true,
      loadTestRunId: runId,
      scenario: "upload-ocr-workflow-throughput",
      synthetic: true,
      payloadSizeTier: payloadTier,
      payloadSource: uploadPayloadSource,
      requestedPayloadBytes: uploadPayloadBytes,
      rawPayloadBytes: uploadPayloadRawBytes,
    },
    model_id: modelId,
    group_id: groupId,
    workflow_config_id: workflowVersionId,
  };
}

export default function () {
  const res = http.post(
    `${baseUrl}/api/upload`,
    JSON.stringify(buildUploadPayload()),
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      timeout: "120s",
    },
  );

  const created = check(res, {
    "status 201": (r) => r.status === 201,
    "upload success true": (r) => r.json("success") === true,
    "document id returned": (r) => typeof r.json("document.id") === "string",
  });

  uploadSuccess.add(created);
  if (res.status === 201) {
    uploadCreatedDuration.add(res.timings.duration);
  }

  sleep(sleepSeconds);
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
  if (!workflowVersionId) {
    throw new Error(
      "Set LOAD_TEST_WORKFLOW_VERSION_ID to an existing WorkflowVersion.id.",
    );
  }
  if (!groupId) {
    throw new Error("Set LOAD_TEST_GROUP_ID to the disposable target group.");
  }
  assertWithinBodyLimit();
}

/**
 * GET /api/documents?group_id= — intentionally stresses full-table read path.
 * Expect high latency or failures once the documents table is very large.
 * Use low VUs first; increase LOAD_TEST_VUS with care.
 */

import { check, sleep } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";
const vus = Number(__ENV.LOAD_TEST_VUS || "1");

export const options = {
  vus,
  duration: __ENV.LOAD_TEST_DURATION || "60s",
  thresholds: {
    // Same failure-rate bar as smoke/datasets; list latency can grow with table size — p95 bound matches request timeout
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<120000"],
  },
};

export default function () {
  const url = `${baseUrl}/api/documents?group_id=${encodeURIComponent(groupId)}`;
  const res = http.get(url, {
    headers: { "x-api-key": apiKey },
    timeout: "120s",
  });
  check(res, {
    "status 200": (r) => r.status === 200,
  });
  sleep(1);
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
}

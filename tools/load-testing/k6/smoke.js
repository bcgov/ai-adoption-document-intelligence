/**
 * Minimal authenticated request to verify API + credentials.
 * Run: k6 run k6/smoke.js (from tools/load-testing)
 */

import { check } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function () {
  const url = `${baseUrl}/api/benchmark/datasets?page=1&limit=5&groupId=${encodeURIComponent(groupId)}`;
  const res = http.get(url, {
    headers: { "x-api-key": apiKey },
  });
  check(res, {
    "status 200": (r) => r.status === 200,
  });
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
}

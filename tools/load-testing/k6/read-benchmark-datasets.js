/**
 * Paginated benchmark datasets read — baseline under large DB.
 * Defaults (1 VU, 1 s sleep) stay under the backend global throttler
 * (100 requests / 60 s per IP). Raise THROTTLE_GLOBAL_LIMIT for multi-VU stress.
 */

import { check, sleep } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";
const sleepSeconds = Number(__ENV.LOAD_TEST_SLEEP_SECONDS || "1");
const vus = Number(__ENV.LOAD_TEST_VUS || "0");
const duration = __ENV.LOAD_TEST_DURATION || "";

const thresholds = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<8000"],
};

export const options =
  vus > 0 && duration
    ? {
        vus,
        duration,
        thresholds,
      }
    : {
        vus: 1,
        duration: "60s",
        thresholds,
      };

export default function () {
  const page = String(Math.floor(Math.random() * 3) + 1);
  const url = `${baseUrl}/api/benchmark/datasets?page=${page}&limit=20&groupId=${encodeURIComponent(groupId)}`;
  const res = http.get(url, {
    headers: { "x-api-key": apiKey },
  });
  check(res, {
    "status 200": (r) => r.status === 200,
  });
  sleep(sleepSeconds);
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
}

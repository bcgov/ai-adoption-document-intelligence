/**
 * HITL review API scenario.
 *
 * Default session mode starts a review session, records one synthetic correction,
 * reads corrections, and skips the session to release the lock. Use only with
 * disposable fixtures created by seed-hitl-fixtures.ts.
 */
// biome-ignore-all lint/correctness/noUndeclaredVariables: k6 provides __ENV, __ITER, and __VU at runtime.
/* global __ENV, __ITER, __VU */

import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3002";
const apiKey = __ENV.LOAD_TEST_API_KEY || "";
const groupId = __ENV.LOAD_TEST_GROUP_ID || "seed-default-group";
const vus = Number(__ENV.LOAD_TEST_VUS || "1");
const duration = __ENV.LOAD_TEST_DURATION || "60s";
const sleepSeconds = Number(__ENV.LOAD_TEST_SLEEP_SECONDS || "1");
const maxConfidence = __ENV.LOAD_TEST_HITL_MAX_CONFIDENCE || "0.9";
const queueLimit = __ENV.LOAD_TEST_HITL_QUEUE_LIMIT || "20";
const sessionMode = (__ENV.LOAD_TEST_HITL_SESSION_MODE || "skip").toLowerCase();
const reviewStatus = __ENV.LOAD_TEST_HITL_REVIEW_STATUS || "pending";

const thresholds = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<30000"],
  hitl_read_success: ["rate>0.95"],
};

if (sessionMode !== "off") {
  thresholds.hitl_session_success = ["rate>0.90"];
}

export const hitlReadSuccess = new Rate("hitl_read_success");
export const hitlSessionSuccess = new Rate("hitl_session_success");
export const hitlNoSession = new Rate("hitl_no_session");
export const hitlQueueDuration = new Trend("hitl_queue_duration");
export const hitlSessionDuration = new Trend("hitl_session_duration");

export const options = {
  vus,
  duration,
  thresholds,
};

function authHeaders(extra = {}) {
  return {
    "x-api-key": apiKey,
    ...extra,
  };
}

function buildUrl(path, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
  return `${baseUrl}${path}${query ? `?${query}` : ""}`;
}

function parseJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function queueUrl(extra = {}) {
  const params = {
    group_id: groupId,
    reviewStatus,
    maxConfidence,
    limit: queueLimit,
    ...extra,
  };
  // setup() runs outside default() — __ITER / __VU are not defined there.
  if (params.offset === undefined) {
    if (typeof __ITER === "number" && typeof __VU === "number") {
      params.offset = String((__ITER + __VU) % 5);
    } else {
      params.offset = "0";
    }
  }
  return buildUrl("/api/hitl/queue", params);
}

function sessionUrl(sessionId, suffix = "") {
  return `${baseUrl}/api/hitl/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

function runReadRequests() {
  const queueRes = http.get(queueUrl(), {
    headers: authHeaders(),
    timeout: "60s",
  });
  const queueOk = check(queueRes, {
    "queue status 200": (res) => res.status === 200,
    "queue documents array": (res) => Array.isArray(res.json("documents")),
  });
  hitlReadSuccess.add(queueOk);
  hitlQueueDuration.add(queueRes.timings.duration);

  const statsRes = http.get(
    buildUrl("/api/hitl/queue/stats", {
      group_id: groupId,
      reviewStatus,
    }),
    { headers: authHeaders(), timeout: "60s" },
  );
  hitlReadSuccess.add(
    check(statsRes, {
      "stats status 200": (res) => res.status === 200,
      "stats totalDocuments numeric": (res) =>
        typeof res.json("totalDocuments") === "number",
    }),
  );

  const analyticsRes = http.get(
    buildUrl("/api/hitl/analytics", { group_id: groupId }),
    { headers: authHeaders(), timeout: "60s" },
  );
  hitlReadSuccess.add(
    check(analyticsRes, {
      "analytics status 200": (res) => res.status === 200,
    }),
  );

  const eligibleRes = http.get(
    buildUrl("/api/benchmark/datasets/from-hitl/eligible-documents", {
      group_id: groupId,
      page: "1",
      limit: queueLimit,
    }),
    { headers: authHeaders(), timeout: "60s" },
  );
  hitlReadSuccess.add(
    check(eligibleRes, {
      "eligible HITL documents status 200": (res) => res.status === 200,
      "eligible HITL documents array": (res) =>
        Array.isArray(res.json("documents")),
    }),
  );
}

function runSessionRequests() {
  if (sessionMode === "off") {
    return;
  }

  const nextRes = http.post(
    buildUrl("/api/hitl/sessions/next", {
      group_id: groupId,
      reviewStatus: "pending",
      maxConfidence,
    }),
    null,
    { headers: authHeaders(), timeout: "60s" },
  );
  const nextOk = check(nextRes, {
    "next session status 200 or 201": (res) =>
      res.status === 200 || res.status === 201,
  });

  const session = parseJson(nextRes);
  if (!nextOk || !session || typeof session.id !== "string") {
    hitlNoSession.add(true);
    hitlSessionSuccess.add(false);
    return;
  }
  hitlNoSession.add(false);

  const sessionId = session.id;
  const getSessionRes = http.get(sessionUrl(sessionId), {
    headers: authHeaders(),
    timeout: "60s",
  });
  const heartbeatRes = http.post(sessionUrl(sessionId, "/heartbeat"), null, {
    headers: authHeaders(),
    timeout: "60s",
  });
  const correctionRes = http.post(
    sessionUrl(sessionId, "/corrections"),
    JSON.stringify({
      corrections: [
        {
          field_key: "load_test_field",
          original_value: `synthetic original ${__VU}-${__ITER}`,
          corrected_value: `synthetic corrected ${__VU}-${__ITER}`,
          original_conf: 0.42,
          action: "corrected",
        },
      ],
    }),
    {
      headers: authHeaders({ "Content-Type": "application/json" }),
      timeout: "60s",
    },
  );
  const getCorrectionsRes = http.get(sessionUrl(sessionId, "/corrections"), {
    headers: authHeaders(),
    timeout: "60s",
  });

  let actionRes = null;
  if (sessionMode === "submit") {
    actionRes = http.post(sessionUrl(sessionId, "/submit"), null, {
      headers: authHeaders(),
      timeout: "60s",
    });
  } else if (sessionMode === "escalate") {
    actionRes = http.post(
      sessionUrl(sessionId, "/escalate"),
      JSON.stringify({ reason: "Synthetic load-test escalation" }),
      {
        headers: authHeaders({ "Content-Type": "application/json" }),
        timeout: "60s",
      },
    );
  } else {
    actionRes = http.post(sessionUrl(sessionId, "/skip"), null, {
      headers: authHeaders(),
      timeout: "60s",
    });
  }

  const sessionOk = check(getSessionRes, {
    "get session status 200": (res) => res.status === 200,
  });
  const heartbeatOk = check(heartbeatRes, {
    "heartbeat status 200 or 201": (res) =>
      res.status === 200 || res.status === 201,
  });
  const correctionOk = check(correctionRes, {
    "correction status 201": (res) => res.status === 201,
  });
  const getCorrectionsOk = check(getCorrectionsRes, {
    "get corrections status 200": (res) => res.status === 200,
  });
  const actionOk = check(actionRes, {
    "session action status 200 or 201": (res) =>
      res.status === 200 || res.status === 201,
  });

  const success =
    sessionOk && heartbeatOk && correctionOk && getCorrectionsOk && actionOk;
  hitlSessionSuccess.add(success);
  hitlSessionDuration.add(
    nextRes.timings.duration +
      getSessionRes.timings.duration +
      heartbeatRes.timings.duration +
      correctionRes.timings.duration +
      getCorrectionsRes.timings.duration +
      actionRes.timings.duration,
  );
}

export default function () {
  runReadRequests();
  runSessionRequests();
  sleep(sleepSeconds);
}

export function setup() {
  if (!apiKey) {
    throw new Error("Set LOAD_TEST_API_KEY (never commit it).");
  }
  if (!groupId) {
    throw new Error("Set LOAD_TEST_GROUP_ID to the disposable target group.");
  }
  if (!["off", "skip", "submit", "escalate"].includes(sessionMode)) {
    throw new Error(
      'LOAD_TEST_HITL_SESSION_MODE must be one of "off", "skip", "submit", or "escalate".',
    );
  }

  if (sessionMode !== "off") {
    const res = http.get(queueUrl({ offset: "0", limit: "1" }), {
      headers: authHeaders(),
      timeout: "60s",
    });
    if (res.status !== 200) {
      throw new Error(`HITL queue preflight failed with status ${res.status}.`);
    }
    if (Number(res.json("total") || 0) < 1) {
      throw new Error(
        "No HITL-eligible documents found. Run npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N> first, or set LOAD_TEST_HITL_SESSION_MODE=off for read-only queue/analytics pressure.",
      );
    }
  }
}

import type { Config } from "./config";
import { logger } from "./logger";

/**
 * Escapes special HTML characters to prevent injection into the email body.
 * @param value - Raw string from an external source.
 * @returns HTML-safe string.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Alertmanager v4 alert object. */
export interface AlertmanagerAlert {
  status: "firing" | "resolved";
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
}

/** Alertmanager v4 webhook payload. */
export interface AlertmanagerPayload {
  version: string;
  groupKey: string;
  status: "firing" | "resolved";
  receiver: string;
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  alerts: AlertmanagerAlert[];
}

interface ChesTokenResponse {
  access_token: string;
  expires_in: number; // seconds
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60_000;

let cachedToken: CachedToken | null = null;

/**
 * Resets the in-memory token cache. Exposed for testing only.
 */
export function resetTokenCache(): void {
  cachedToken = null;
}

interface ChesEmailResponse {
  txId: string;
  messages: Array<{ msgId: string; to: string[] }>;
}

interface ChesEmailPayload {
  from: string;
  to: string[];
  subject: string;
  bodyType: "html";
  body: string;
  priority: "high" | "normal" | "low";
}

/**
 * Fetches a CHES OAuth2 access token using the client_credentials flow,
 * caching the result until 60 seconds before expiry.
 * POSTs to `{chesAuthHost}/auth/realms/comsvcauth/protocol/openid-connect/token`
 * with Basic auth derived from clientId and clientSecret.
 * @param config - Validated service config.
 * @returns A short-lived CHES Bearer access token.
 */
export async function getChesToken(config: Config): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(
    `${config.chesClientId}:${config.chesClientSecret}`,
  ).toString("base64");

  const tokenUrl = `${config.chesAuthHost}/auth/realms/comsvcauth/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!response.ok) {
    throw new Error(
      `CHES token request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as ChesTokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

/**
 * Builds a CHES-compatible email payload from an Alertmanager webhook payload.
 * @param payload - The Alertmanager v4 webhook payload.
 * @param config - Validated service config.
 * @returns A ChesEmailPayload ready to POST to CHES /api/v1/email.
 */
export function buildEmail(
  payload: AlertmanagerPayload,
  config: Config,
): ChesEmailPayload {
  const alertName = escapeHtml(payload.commonLabels["alertname"] ?? "Unknown Alert");
  const severity = escapeHtml(payload.commonLabels["severity"] ?? "unknown");
  const job = escapeHtml(payload.commonLabels["job"] ?? "unknown");
  const subject = `[Alert: ${severity.toUpperCase()}] ${alertName} (${job})`;

  const firingAlerts = payload.alerts.filter((a) => a.status === "firing");
  const alertRows = firingAlerts
    .map((alert) => {
      const name = escapeHtml(alert.labels["alertname"] ?? alertName);
      const sev = escapeHtml(alert.labels["severity"] ?? severity);
      const summary = escapeHtml(alert.annotations["summary"] ?? "");
      const description = escapeHtml(alert.annotations["description"] ?? "");
      const startedAt = escapeHtml(new Date(alert.startsAt).toUTCString());
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${name}</td>
          <td style="padding:8px;border:1px solid #ddd">${sev}</td>
          <td style="padding:8px;border:1px solid #ddd">${summary}</td>
          <td style="padding:8px;border:1px solid #ddd">${description}</td>
          <td style="padding:8px;border:1px solid #ddd">${startedAt}</td>
        </tr>`;
    })
    .join("");

  const body = `
    <h2 style="color:#c0392b">Prometheus Alert Notification</h2>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:4px 12px 4px 0"><strong>Status</strong></td><td>${escapeHtml(payload.status.toUpperCase())}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Alert</strong></td><td>${alertName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Severity</strong></td><td>${severity}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Job</strong></td><td>${job}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Summary</strong></td><td>${escapeHtml(payload.commonAnnotations["summary"] ?? "")}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Description</strong></td><td>${escapeHtml(payload.commonAnnotations["description"] ?? "")}</td></tr>
    </table>
    <h3>Firing alerts (${firingAlerts.length})</h3>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Alert</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Severity</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Summary</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Description</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Started at</th>
        </tr>
      </thead>
      <tbody>${alertRows}</tbody>
    </table>
    <p style="margin-top:16px">
      <a href="${escapeHtml(payload.externalURL)}">View in Alertmanager</a>
    </p>
  `;

  return {
    from: config.chesFromEmail,
    to: config.chesToEmails,
    subject,
    bodyType: "html",
    body,
    priority: severity === "critical" ? "high" : "normal",
  };
}

/**
 * Sends an email via the CHES /api/v1/email endpoint.
 * @param token - A valid CHES Bearer access token.
 * @param email - The email payload to send.
 * @param config - Validated service config.
 */
export async function sendEmail(
  token: string,
  email: ChesEmailPayload,
  config: Config,
): Promise<void> {
  const url = `${config.chesHost}/api/v1/email`;
  const correlationId = Math.random().toString(36).slice(2, 10);

  logger.info("Sending CHES email", {
    correlationId,
    to: email.to,
    subject: email.subject,
    priority: email.priority,
    recipientCount: email.to.length,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CHES email send failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as ChesEmailResponse;
  const msgIds = result.messages.map((m) => m.msgId);
  logger.info("CHES email queued", { correlationId, txId: result.txId, msgIds });
}

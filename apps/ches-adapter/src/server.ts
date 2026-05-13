import http from "node:http";
import type { Config } from "./config";
import {
  buildEmail,
  getChesToken,
  sendEmail,
  type AlertmanagerPayload,
} from "./ches";

/**
 * Validates the `Authorization: Bearer <secret>` header against the configured
 * webhook secret.
 * @param authHeader - Raw value of the Authorization header.
 * @param expectedSecret - The configured webhook secret.
 * @returns true if the request should be allowed.
 */
export function isAuthorized(
  authHeader: string | undefined,
  expectedSecret: string,
): boolean {
  const provided = authHeader?.replace(/^Bearer\s+/i, "");
  return provided === expectedSecret;
}

/**
 * Reads the full request body as a UTF-8 string.
 * @param req - Incoming HTTP request.
 * @returns Resolved body string.
 */
async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Creates and returns the webhook HTTP server.
 * The server accepts only `POST /` and validates the shared Bearer secret.
 * @param config - Validated service configuration.
 * @returns A Node.js http.Server instance (not yet listening).
 */
export function createServer(config: Config): http.Server {
  return http.createServer(async (req, res) => {
    // Only accept POST /
    if (req.method !== "POST" || req.url !== "/") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Validate shared webhook secret
    if (!isAuthorized(req.headers["authorization"], config.adapterSecret)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid webhook secret" }));
      return;
    }

    let payload: AlertmanagerPayload;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body) as AlertmanagerPayload;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    // Resolved alerts are acknowledged but produce no email
    if (payload.status !== "firing") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const token = await getChesToken(config);
      const email = buildEmail(payload, config);
      await sendEmail(token, email, config);
      res.writeHead(204);
      res.end();
    } catch (err) {
      console.error(new Date().toISOString(), "Failed to send CHES notification", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
}

#!/usr/bin/env node

/**
 * Loopback OAuth2 token endpoint backed by the local `az login` session.
 *
 * Fluent Bit's azure_logs_ingestion output only implements the client_credentials
 * flow, but its `auth_url` may point at a loopback HTTP address. Serving the
 * developer's own Entra token there lets local log shipping work without an app
 * registration. The signed-in user -- not a service principal -- must hold
 * Monitoring Metrics Publisher on the target DCR.
 *
 * Local development only. Binds to 127.0.0.1 so the token is never exposed off-host.
 */

const http = require("node:http");
const { execFile } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AZURE_TOKEN_BROKER_PORT || 8899);
const RESOURCE =
  process.env.AZURE_TOKEN_BROKER_RESOURCE || "https://monitor.azure.com";

// Re-mint this long before expiry so Fluent Bit never presents a stale token.
const REFRESH_MARGIN_SECONDS = 300;
const FALLBACK_LIFETIME_SECONDS = 3600;

let cached = null;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Parses the expiry from `az account get-access-token` output, which reports it
 * as an epoch value on newer CLI versions and a local-time string on older ones.
 *
 * @param {Record<string, unknown>} parsed Parsed az JSON output.
 * @returns {number} Expiry as epoch seconds.
 */
function readExpiry(parsed) {
  const epoch = Number(parsed.expires_on);
  if (Number.isFinite(epoch) && epoch > 0) {
    return epoch;
  }
  const parsedDate = Date.parse(String(parsed.expiresOn));
  if (Number.isFinite(parsedDate)) {
    return Math.floor(parsedDate / 1000);
  }
  return nowSeconds() + FALLBACK_LIFETIME_SECONDS;
}

/**
 * Requests a fresh access token from the Azure CLI session.
 *
 * @returns {Promise<{token: string, expiresAtSeconds: number}>} The token and its expiry.
 */
function fetchToken() {
  return new Promise((resolve, reject) => {
    execFile(
      "az",
      [
        "account",
        "get-access-token",
        "--resource",
        RESOURCE,
        "--output",
        "json",
      ],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr).trim() || error.message));
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (_error) {
          reject(new Error("could not parse Azure CLI output"));
          return;
        }
        if (!parsed.accessToken) {
          reject(new Error("Azure CLI returned no accessToken"));
          return;
        }
        resolve({
          token: parsed.accessToken,
          expiresAtSeconds: readExpiry(parsed),
        });
      },
    );
  });
}

/**
 * Returns a cached token, refreshing it when it is close to expiry.
 *
 * @returns {Promise<{token: string, expiresAtSeconds: number}>} The token and its expiry.
 */
async function getToken() {
  if (
    cached &&
    cached.expiresAtSeconds - nowSeconds() > REFRESH_MARGIN_SECONDS
  ) {
    return cached;
  }
  cached = await fetchToken();
  return cached;
}

const server = http.createServer((req, res) => {
  // Fluent Bit POSTs client_credentials form data; it carries nothing we need.
  req.resume();
  req.on("end", () => {
    getToken()
      .then((entry) => {
        const expiresIn = Math.max(entry.expiresAtSeconds - nowSeconds(), 60);
        const body = JSON.stringify({
          token_type: "Bearer",
          access_token: entry.token,
          expires_in: expiresIn,
          ext_expires_in: expiresIn,
        });
        res.writeHead(200, {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
        console.log(`[token-broker] issued token, expires in ${expiresIn}s`);
      })
      .catch((error) => {
        const body = JSON.stringify({
          error: "invalid_grant",
          error_description: "unable to acquire a token from the Azure CLI session",
        });
        res.writeHead(500, {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
        console.error(`[token-broker] ${error.message}`);
      });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[token-broker] listening on http://${HOST}:${PORT}`);
  console.log(`[token-broker] resource: ${RESOURCE}`);
  console.log("[token-broker] requires an active `az login` session");
});

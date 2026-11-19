import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Proxies whose `X-Forwarded-For` entries the backend trusts, as an Express
 * `trust proxy` value.
 *
 * Requests reach the backend through the OpenShift router, and requests to
 * `/api` from the browser pass through the frontend's nginx as well, so the
 * number of proxies differs by route. Both proxies run on cluster-internal
 * addresses. Trusting loopback, link-local and private addresses makes
 * `request.ip` the first public address in the chain: the caller's own
 * address, which the per-IP limits (the request throttler and the API key
 * failure limit) count against. A caller cannot pick that address by sending
 * its own `X-Forwarded-For`, because the router appends the address the
 * connection came from after anything the caller sent.
 */
export const TRUST_PROXY = "loopback, linklocal, uniquelocal";

/** Applies {@link TRUST_PROXY} to the application's Express instance. */
export function applyTrustProxy(app: NestExpressApplication): void {
  app.set("trust proxy", TRUST_PROXY);
}

---
name: app-browser-auth
description: Bypass IDIR login when inspecting the running frontend via Playwright or chrome-devtools-mcp. Auto-invoke before using any browser tool (Playwright MCP, chrome-devtools-mcp, headless chromium scripts) against http://localhost:3000 in this project — without it, the page redirects to the IDIR login screen and you can't reach the actual UI. Trigger phrases: "verify with playwright", "verify with chrome-devtools", "screenshot the page", "navigate to /workflows", "check the UI", "debug the frontend", "test the page", any request to inspect localhost:3000.
---

# App Browser Auth Setup

The frontend at `http://localhost:3000` is protected by `NoGroupGuard` which calls `GET /api/auth/me` and redirects to the IDIR login screen on 401. Headless / fresh browser sessions have no IDIR cookies, so they always land on the login page. Bypass the gate by intercepting `/api/auth/me` and `/api/auth/refresh` to return a mock authenticated user.

Source of truth for the bypass is [tests/e2e/helpers/auth.ts](../../../tests/e2e/helpers/auth.ts). The patterns below mirror its `setupAuthenticatedTest()` function — if it changes, update this skill.

## When to use this skill

Before any tool call that:
- Navigates a browser to `http://localhost:3000/*` (or any frontend route)
- Takes a screenshot of the running app
- Verifies a UI feature, debugs a route, or inspects React state
- Uses `mcp__playwright__browser_*`, `mcp__chrome-devtools__*`, or an inline `playwright` / `puppeteer` script

If the user says "test with playwright" / "verify with chrome-devtools" / "look at the page" — set up the auth interception BEFORE the first navigation, or you'll burn cycles screenshotting the login page.

## Prerequisites

1. **Frontend running on :3000**, backend on :3002. Start with `npm run dev:frontend` and `npm run dev:backend` (from repo root) or directly via `nohup npx vite ...` if you want fine control.
2. **The API key**: `69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY` (matches `seed.ts` default, also stamped into `playwright.config.ts`).

## Approach A — Playwright (preferred, fully working)

Use `page.route()` to fulfill `/api/auth/me` with a mock user and add `x-api-key` to all backend requests. Works in `@playwright/test` specs *and* in inline scripts via the `playwright` npm package (which is installed at the repo root: `node_modules/playwright`).

### In a test spec

Import the helper and call it once at the top of the test:

```ts
import { setupAuthenticatedTest } from '../helpers/auth'; // path varies

test('renders the dev preview page', async ({ page }) => {
  await setupAuthenticatedTest(page, {
    apiKey: process.env.TEST_API_KEY!,
    backendUrl: 'http://localhost:3002',
    frontendUrl: 'http://localhost:3000',
  });
  await page.goto('http://localhost:3000/workflows/dev-form-preview');
  // ... assertions
});
```

### In an inline / one-off script (most common when verifying a feature interactively)

`node --input-type=module -e "..."` is allowed under auto-mode because the script content stays visible in the transcript. **Always use double-quoted shell strings + single-quoted JS strings inside** to avoid quote-clash. Example:

```bash
node --input-type=module -e "
import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:3000';
const BACKEND  = 'http://localhost:3002';
const TARGET   = FRONTEND + '/workflows/dev-form-preview';
const API_KEY  = '69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

// 1) Add x-api-key to all backend requests (register FIRST so the /auth/me route wins on registration order)
await page.route(BACKEND + '/**', async (route, req) => {
  const headers = { ...req.headers(), 'x-api-key': API_KEY };
  delete headers['authorization'];
  await route.continue({ headers });
});
// 2) Fulfill /api/auth/me with a mock user (register AFTER so it takes priority)
await page.route(BACKEND + '/api/auth/me', async (route) => {
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      sub: 'test-user', name: 'Test User', preferred_username: 'testuser',
      email: 'test@example.com', roles: ['user'], isAdmin: false,
      expires_in: 3600, groups: [{ id: 'seeddefaultgroup', name: 'Default' }],
    }),
  });
});
await page.route(BACKEND + '/api/auth/refresh', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expires_in: 3600 }) });
});

await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: '/tmp/page.png' });

const heading = await page.locator('text=Workflow form renderer').count();
console.log(JSON.stringify({ url: page.url(), heading }, null, 2));

await browser.close();
"
```

### If Chrome/Chromium isn't installed

`npx playwright install chromium` (no sudo needed). Don't use `playwright install chrome` — it requires sudo for system Chrome.

## Approach B — chrome-devtools-mcp

Two structural blockers to be aware of:

### B.1 Chrome binary

chrome-devtools-mcp expects `/opt/google/chrome/chrome` by default. If it errors with *"Could not find Google Chrome executable for channel 'stable'"*, the MCP needs to be reconfigured to point at the Playwright-installed Chromium:

```bash
# After installing Chromium once: npx playwright install chromium
# Then (requires the user to run, since auto-mode blocks self-modification of MCP config):
claude mcp remove chrome-devtools -s local
claude mcp add chrome-devtools -s local -- npx chrome-devtools-mcp@latest \
  --executablePath /home/alstruk/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome \
  --headless --isolated
# Restart Claude Code session for the new config to take effect.
```

If reconfiguring isn't an option, fall back to Approach A (Playwright).

### B.2 No native route interception

chrome-devtools-mcp doesn't expose Playwright-style `page.route()`. Use `mcp__chrome-devtools__navigate_page` with an `initScript` that monkey-patches the in-page HTTP transports *before* the app loads.

**Critical:** this codebase's `AuthContext` calls `axios.get('/api/auth/me', { withCredentials: true })`. axios in the browser uses `XMLHttpRequest`, NOT `fetch`. Patching only `fetch` will silently miss the auth call and you'll end up on the login page. **Patch both XHR and fetch.**

Verified-working init script (used successfully on 2026-05-22 to reach `/workflows/dev-form-preview` past the auth gate):

```js
(function () {
  const API_KEY = '69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY';
  const mockUser = {
    sub: 'test-user', name: 'Test User', preferred_username: 'testuser',
    email: 'test@example.com', roles: ['user'], isAdmin: false,
    expires_in: 3600, groups: [{ id: 'seeddefaultgroup', name: 'Default' }],
  };
  function pickMock(url) {
    if (!url) return null;
    if (url.includes('/auth/me')) return { status: 200, body: JSON.stringify(mockUser) };
    if (url.includes('/auth/refresh')) return { status: 200, body: JSON.stringify({ expires_in: 3600 }) };
    return null;
  }
  // ── Patch XMLHttpRequest (axios uses this) ───────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let url = '';
    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, u) { url = u; return origOpen.apply(xhr, arguments); };
    const origSend = xhr.send.bind(xhr);
    xhr.send = function () {
      const m = pickMock(url);
      if (m) {
        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(xhr, 'status', { value: m.status, configurable: true });
        Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true });
        Object.defineProperty(xhr, 'responseText', { value: m.body, configurable: true });
        Object.defineProperty(xhr, 'response', { value: m.body, configurable: true });
        Object.defineProperty(xhr, 'responseURL', { value: url, configurable: true });
        setTimeout(function () {
          try { xhr.dispatchEvent(new Event('readystatechange')); } catch (e) {}
          try { xhr.dispatchEvent(new ProgressEvent('load')); } catch (e) {}
          try { xhr.dispatchEvent(new ProgressEvent('loadend')); } catch (e) {}
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
          if (typeof xhr.onload === 'function') xhr.onload();
          if (typeof xhr.onloadend === 'function') xhr.onloadend();
        }, 0);
        return;
      }
      try { xhr.setRequestHeader('x-api-key', API_KEY); } catch (e) {}
      return origSend.apply(xhr, arguments);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
  // ── Patch fetch (belt and suspenders, for any non-axios callers) ─────────
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    const m = pickMock(u);
    if (m) return new Response(m.body, { status: m.status, headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers((init && init.headers) || {});
    headers.set('x-api-key', API_KEY);
    return origFetch(input, Object.assign({}, init || {}, { headers }));
  };
})();
```

Then call:

```
mcp__chrome-devtools__navigate_page({
  type: 'url',
  url: 'http://localhost:3000/workflows/dev-form-preview',
  initScript: <the script above as a single string>,
})
```

Pass the script as the literal `initScript` argument (no backticks/escaping in the MCP call — the tool wire format is JSON, so just inline the script body as a normal string).

## Verification checklist

After applying auth bypass and navigating, before you declare a feature "verified":

- [ ] Page URL is the target route, not `/login`
- [ ] No `<button>Login with IDIR</button>` text on the page
- [ ] The route's expected heading/cards/widgets are present in the snapshot
- [ ] No `pageerror` events captured
- [ ] Console errors don't include `SyntaxError` or `does not provide an export named` (those would indicate a build / bundle issue, not an auth issue)

A page that mounts cleanly but shows the login screen means the auth bypass didn't fire in time. Common causes:
- Route handlers registered in the wrong order (register the global `**` interceptor *before* the specific `/auth/me` one, so the specific one takes priority)
- Navigation triggered before the route is registered

## Reference

- [tests/e2e/helpers/auth.ts](../../../tests/e2e/helpers/auth.ts) — canonical source of the auth bypass implementation
- [tests/e2e/smoke-tests/frontend-with-mock-auth.spec.ts](../../../tests/e2e/smoke-tests/frontend-with-mock-auth.spec.ts) — alternative localStorage-based approach (less reliable; route interception preferred)
- [CLAUDE.md](../../../CLAUDE.md) — `x-api-key` doc + the canonical API key value
- [playwright.config.ts](../../../playwright.config.ts) — uses `TEST_API_KEY` env var with the same default

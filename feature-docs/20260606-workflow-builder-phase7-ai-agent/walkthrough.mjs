import { chromium } from 'playwright';
import fs from 'fs/promises';

const FRONTEND = 'http://localhost:3000';
const API_KEY = '69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY';
const OUT = '/tmp/wb-phase7-verify';

const results = { scenarios: {}, pageErrors: 0, totalDurationMs: 0, workflowsCreated: [] };
const start = Date.now();
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.route('**/api/**', async (route, req) => {
  const headers = { ...req.headers(), 'x-api-key': API_KEY };
  delete headers['authorization'];
  await route.continue({ headers });
});
await page.route('**/api/auth/me', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ sub:'test-user', name:'Test User', preferred_username:'testuser', email:'test@example.com', roles:['user'], isAdmin:false, expires_in:3600, groups:[{id:'seeddefaultgroup',name:'Default'}] }) });
});
await page.route('**/api/auth/refresh', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expires_in: 3600 }) });
});

async function send(prompt, opts = {}) {
  const wait = opts.wait ?? 90;
  const ta = page.locator('[data-testid=agent-chat-textarea]');
  await ta.click();
  await ta.fill('');
  await page.keyboard.type(prompt);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  let last = 0; let stable = 0;
  for (let i = 0; i < wait; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator('[data-testid=agent-chat-thread]').innerText().catch(() => '');
    if (t.length === last) stable += 1; else { stable = 0; last = t.length; }
    if (stable >= 5 && t.length > 100) break;
  }
}

async function shot(n, label) {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${label}.png`, fullPage: false });
}

try {
  console.log('S1: greenfield build');
  await page.goto(FRONTEND, { waitUntil: 'load', timeout: 30000 });
  await shot(1, 'home');
  await page.locator('[data-testid=agent-chat-icon]').click();
  await page.waitForSelector('[data-testid=agent-chat-textarea]', { state: 'visible' });
  await shot(2, 'drawer-open');
  await send('Create a new workflow named "phase7 demo". Add a file.prepare node (id fp). Connect upload1 -> fp.', { wait: 120 });
  await shot(3, 'after-build');
  const urlS1 = page.url();
  results.scenarios.S1 = urlS1.includes('workflows/create-v2?id=') ? 'PASS' : 'FAIL';
  const m = urlS1.match(/id=([^&]+)/);
  if (m) results.workflowsCreated.push(m[1]);

  console.log('S2: file drop');
  await fs.writeFile('/tmp/wb-phase7-verify/sample.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 16>>stream\nBT /F1 12 Tf ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000050 00000 n \n0000000091 00000 n \n0000000150 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n210\n%%EOF\n');
  await page.locator('[data-testid=agent-chat-file-input]').setInputFiles(['/tmp/wb-phase7-verify/sample.pdf']);
  await page.waitForTimeout(5000);
  await shot(4, 'after-file-drop');
  const attachCount = await page.locator('[data-testid=agent-chat-attachment]').count();
  results.scenarios.S2 = attachCount > 0 ? 'PASS' : 'FAIL';

  console.log('S3: conversation switcher');
  await page.locator('[data-testid=agent-chat-conversation-switcher]').click();
  await page.waitForTimeout(700);
  await shot(5, 'switcher-open');
  const convCount = await page.locator('[data-testid^=agent-chat-conversation-]').count();
  results.scenarios.S3 = convCount > 0 ? 'PASS' : 'FAIL';

  console.log('S4: new conversation reset + simple list');
  await page.locator('[data-testid=agent-chat-conversation-switcher]').click();
  await page.locator('[data-testid=agent-chat-reset]').click();
  await page.waitForTimeout(500);
  await send('How many activities are in the catalog? Just give me the number.', { wait: 45 });
  await shot(6, 'after-list');
  const afterList = await page.locator('[data-testid=agent-chat-thread]').innerText();
  results.scenarios.S4 = /\b41\b/.test(afterList) ? 'PASS' : (afterList.length > 250 ? 'PARTIAL' : 'FAIL');

  console.log('S5: model picker visible');
  const pickerCount = await page.locator('[data-testid=agent-chat-model-picker]').count();
  results.scenarios.S5 = pickerCount > 0 ? 'PASS' : 'FAIL';
  await shot(7, 'model-picker');

  console.log('S6: abort + global icon visible');
  const abortCount = await page.locator('[data-testid=agent-chat-abort]').count();
  const iconCount = await page.locator('[data-testid=agent-chat-icon]').count();
  results.scenarios.S6 = abortCount > 0 && iconCount > 0 ? 'PASS' : 'FAIL';

  console.log('S7: resume across reopen');
  await page.locator('[data-testid=agent-chat-close]').click();
  await page.waitForTimeout(500);
  await page.goto(FRONTEND, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('[data-testid=agent-chat-icon]', { state: 'visible' });
  await page.locator('[data-testid=agent-chat-icon]').click();
  await page.waitForSelector('[data-testid=agent-chat-textarea]', { state: 'visible' });
  await page.locator('[data-testid=agent-chat-conversation-switcher]').click();
  await page.waitForTimeout(1000);
  await shot(8, 'reopened-history');
  const convAfter = await page.locator('[data-testid^=agent-chat-conversation-]').count();
  results.scenarios.S7 = convAfter > 0 ? 'PASS' : 'FAIL';

  console.log('S8: pageErrors === 0');
  results.pageErrors = pageErrors.length;
  results.scenarios.S8 = pageErrors.length === 0 ? 'PASS' : 'FAIL';

} catch (err) {
  console.log('walkthrough error:', err.message);
  results.error = err.message;
}

results.totalDurationMs = Date.now() - start;
await fs.writeFile(`${OUT}/summary.json`, JSON.stringify(results, null, 2));

console.log('=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
console.log('pageErrors:', pageErrors);
await browser.close();

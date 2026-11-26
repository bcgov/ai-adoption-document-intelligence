import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readForms, readSettings } from "./config";

describe("readSettings", () => {
  it("uses the defaults and falls back to TEST_API_KEY", () => {
    const settings = readSettings({ TEST_API_KEY: "key-from-test" });
    assert.deepEqual(settings, {
      backendUrl: "http://localhost:3002",
      apiKey: "key-from-test",
      groupId: "seeddefaultgroup",
    });
  });

  it("prefers the BENCH_ settings and trims a trailing slash", () => {
    const settings = readSettings({
      BENCH_API_KEY: "bench-key",
      TEST_API_KEY: "ignored",
      BENCH_GROUP_ID: "group-9",
      BENCH_BACKEND_URL: "http://example.test:3002/",
    });
    assert.deepEqual(settings, {
      backendUrl: "http://example.test:3002",
      apiKey: "bench-key",
      groupId: "group-9",
    });
  });

  it("refuses to run without an API key, naming the setting", () => {
    assert.throws(() => readSettings({}), /BENCH_API_KEY/);
  });
});

describe("readForms", () => {
  it("lists ten forms with unique ids and direct PDF links", () => {
    const forms = readForms();
    assert.equal(forms.length, 10);
    assert.equal(new Set(forms.map((form) => form.id)).size, 10);
    for (const form of forms) {
      assert.match(form.url, /^https:\/\/www2\.gov\.bc\.ca\/.+\.pdf$/);
    }
  });
});

import { AbortFlagMap } from "./abort-flag-map";

describe("AbortFlagMap", () => {
  it("register returns an AbortController whose signal is initially not aborted", () => {
    const map = new AbortFlagMap();
    const c = map.register("c1");
    expect(c.signal.aborted).toBe(false);
  });

  it("abort fires the signal on the registered controller", () => {
    const map = new AbortFlagMap();
    const c = map.register("c1");
    const aborted = map.abort("c1");
    expect(aborted).toBe(true);
    expect(c.signal.aborted).toBe(true);
  });

  it("abort on an unregistered id returns false (idempotent)", () => {
    const map = new AbortFlagMap();
    expect(map.abort("nonexistent")).toBe(false);
  });

  it("re-registering aborts the previous controller", () => {
    const map = new AbortFlagMap();
    const first = map.register("c1");
    const second = map.register("c1");
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("clear removes the entry without aborting", () => {
    const map = new AbortFlagMap();
    const c = map.register("c1");
    map.clear("c1");
    expect(c.signal.aborted).toBe(false);
    expect(map.abort("c1")).toBe(false);
  });
});

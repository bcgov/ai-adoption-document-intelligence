import { AbortFlagMap } from "./abort-flag-map";

describe("AbortFlagMap", () => {
  it("register returns a handle whose controller signal is initially not aborted", () => {
    const map = new AbortFlagMap();
    const reg = map.register("c1");
    expect(reg.controller.signal.aborted).toBe(false);
  });

  it("abort fires the signal on the registered controller", () => {
    const map = new AbortFlagMap();
    const reg = map.register("c1");
    const aborted = map.abort("c1");
    expect(aborted).toBe(true);
    expect(reg.controller.signal.aborted).toBe(true);
  });

  it("abort on an unregistered id returns false (idempotent)", () => {
    const map = new AbortFlagMap();
    expect(map.abort("nonexistent")).toBe(false);
  });

  it("re-registering aborts the previous controller", () => {
    const map = new AbortFlagMap();
    const first = map.register("c1");
    const second = map.register("c1");
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
  });

  it("clear() on a handle removes the entry without aborting", () => {
    const map = new AbortFlagMap();
    const reg = map.register("c1");
    reg.clear();
    expect(reg.controller.signal.aborted).toBe(false);
    expect(map.abort("c1")).toBe(false);
  });

  it("clear(conversationId) removes the entry without aborting", () => {
    const map = new AbortFlagMap();
    const reg = map.register("c1");
    map.clear("c1");
    expect(reg.controller.signal.aborted).toBe(false);
    expect(map.abort("c1")).toBe(false);
  });

  describe("abort-registry race (compare-and-delete)", () => {
    it("turn1's cleanup must NOT remove turn2's controller, and abort(turn2) still works", () => {
      const map = new AbortFlagMap();

      // Turn 1 registers and starts streaming.
      const turn1 = map.register("conv-1");

      // Turn 2 is resent before turn 1 settles — it replaces (and aborts)
      // turn 1's controller.
      const turn2 = map.register("conv-1");
      expect(turn1.controller.signal.aborted).toBe(true);

      // Turn 1's stream finally settles and runs its scoped cleanup. With
      // compare-and-delete this is a no-op because turn2 is now the mapped
      // controller.
      turn1.clear();

      // The abort endpoint targeting the live (turn 2) stream must still
      // find and fire turn 2's controller.
      expect(map.abort("conv-1")).toBe(true);
      expect(turn2.controller.signal.aborted).toBe(true);
    });

    it("the live turn's own clear() does evict it once it settles", () => {
      const map = new AbortFlagMap();
      const turn1 = map.register("conv-1");
      const turn2 = map.register("conv-1");
      turn1.clear(); // no-op
      turn2.clear(); // turn2 is current → evicted
      expect(map.abort("conv-1")).toBe(false);
    });
  });
});

import { expect, it } from "vitest";
import * as R from "react";
import { createRoot } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";
const tick = () => new Promise((r) => setTimeout(r, 15));
it.each(["passive", "layout", "portal", "insertion"] as const)(
  "orders the %s handoff phases",
  async (kind) => {
    const log: string[] = [],
      c = document.createElement("div"),
      portal = document.createElement("div");
    document.body.append(c, portal);
    const root = createRoot(c),
      use =
        kind === "layout"
          ? R.useLayoutEffect
          : kind === "insertion"
          ? R.useInsertionEffect
          : R.useEffect;
    function Overlay({ name, open }: { name: string; open: boolean }) {
      use(() => {
        if (!open) return;
        log.push(name + " effect");
        return () => {
          log.push(name + " cleanup");
        };
      }, [open]);
      const child = <p>{name}</p>;
      return kind === "portal" ? createPortal(child, portal) : child;
    }
    const view = (b: boolean) => (
      <div>
        <Overlay name="B" open={b} />
        <Overlay name="A" open={!b} />
      </div>
    );
    try {
      flushSync(() => root.render(view(false)));
      await tick();
      log.length = 0;
      flushSync(() => root.render(view(true)));
      await tick();
      expect(log).toEqual(
        kind === "insertion"
          ? ["B effect", "A cleanup"]
          : ["A cleanup", "B effect"]
      );
      log.length = 0;
      flushSync(() => root.render(view(true)));
      await tick();
      expect(log).toEqual([]);
    } finally {
      flushSync(() => root.unmount());
      c.remove();
      portal.remove();
    }
  }
);
it("cleans every changed passive hook before any replacement is created", async () => {
  const log: string[] = [],
    c = document.createElement("div"),
    root = createRoot(c);
  function Child({ name, value }: { name: string; value: number }) {
    R.useEffect(() => {
      log.push(name + " create " + value);
      return () => {
        log.push(name + " cleanup " + value);
      };
    }, [value]);
    return null;
  }
  const view = (value: number) => (
    <>
      <Child name="one" value={value} />
      <Child name="two" value={value} />
    </>
  );
  try {
    flushSync(() => root.render(view(0)));
    await tick();
    log.length = 0;
    flushSync(() => root.render(view(1)));
    await tick();
    expect(log).toEqual([
      "one cleanup 0",
      "two cleanup 0",
      "one create 1",
      "two create 1",
    ]);
  } finally {
    flushSync(() => root.unmount());
  }
});

import { expect, it, vi } from "vitest";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { flushSync } from "react-dom";
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
it("does not commit partial effects when a server reveal still awaits client data", async () => {
  const c = document.createElement("div");
  c.innerHTML =
    '<main><!--$?7--><template id="B:7"></template><i>waiting</i><!--/$--><button>ready</button></main>';
  document.body.append(c);
  let reveal!: () => void, resolve!: (v: string) => void;
  vi.stubGlobal("$RH", (_id: number, callback: () => void) => {
    reveal = callback;
  });
  const p = new Promise<string>((yes) => (resolve = yes)),
    effect = vi.fn(),
    click = vi.fn(),
    error = vi.fn();
  function Ready() {
    React.useLayoutEffect(effect, []);
    return <span>before</span>;
  }
  function Pending() {
    React.use(p);
    return <nav>nav</nav>;
  }
  const root = hydrateRoot(
    c,
    <main>
      <React.Suspense fallback={<i>waiting</i>}>
        <div>
          <Ready />
          <Pending />
        </div>
      </React.Suspense>
      <button onClick={click}>ready</button>
    </main>,
    { onRecoverableError: error }
  );
  try {
    expect(typeof reveal).toBe("function");
    const marker = c.querySelector("main")!.firstChild as Comment;
    marker.data = "$7";
    const content = document.createElement("div");
    content.innerHTML = "<span>before</span><nav>nav</nav>";
    c.querySelector("i")!.remove();
    c.querySelector('[id="B:7"]')!.replaceWith(content);
    const before = Array.from(content.querySelectorAll("*"));
    reveal();
    expect(effect).not.toHaveBeenCalled();
    c.querySelector("button")!.click();
    expect(click).toHaveBeenCalledTimes(1);
    resolve("ready");
    for (let i = 0; i < 30 && !effect.mock.calls.length; i++) await wait();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(before.every((n) => c.contains(n))).toBe(true);
  } finally {
    resolve("ready");
    flushSync(() => root.unmount());
    c.remove();
    vi.unstubAllGlobals();
  }
});

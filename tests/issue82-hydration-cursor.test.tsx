import { expect, it, vi } from "vitest";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { flushSync } from "react-dom";
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await wait();
  expect(check()).toBe(true);
}
it.each([false, true])(
  "keeps matching server hosts around a suspending function, sibling=%s",
  async (sibling) => {
    const c = document.createElement("div");
    c.innerHTML =
      "<div><nav>nav</nav>" + (sibling ? "<span>after</span>" : "") + "</div>";
    document.body.append(c);
    const before = Array.from(c.querySelectorAll("*")),
      error = vi.fn(),
      effect = vi.fn();
    let resolve!: (value: string) => void,
      attempts = 0;
    const p = new Promise<string>((yes) => (resolve = yes));
    function Pending() {
      attempts++;
      React.use(p);
      React.useLayoutEffect(effect, []);
      return <nav>nav</nav>;
    }
    const root = hydrateRoot(
      c,
      <div>
        <Pending />
        {sibling && <span>after</span>}
      </div>,
      { onRecoverableError: error }
    );
    try {
      await until(() => attempts > 0);
      expect(effect).not.toHaveBeenCalled();
      expect(before.every((n) => c.contains(n))).toBe(true);
      resolve("ready");
      await until(() => effect.mock.calls.length > 0);
      expect(error).not.toHaveBeenCalled();
      expect(before.every((n) => c.contains(n))).toBe(true);
      expect(c.textContent).toBe(sibling ? "navafter" : "nav");
      expect(effect).toHaveBeenCalledTimes(1);
    } finally {
      flushSync(() => root.unmount());
      c.remove();
    }
  }
);
it("hydrates siblings outside a pending boundary while keeping its server DOM", async () => {
  const c = document.createElement("div");
  c.innerHTML =
    "<main><!--$--><div><nav>nav</nav></div><!--/$--><button>ready</button></main>";
  document.body.append(c);
  const before = Array.from(c.querySelectorAll("*")),
    click = vi.fn(),
    error = vi.fn();
  let resolve!: (value: string) => void,
    attempts = 0;
  const p = new Promise<string>((yes) => (resolve = yes));
  function Pending() {
    attempts++;
    React.use(p);
    return <nav>nav</nav>;
  }
  const root = hydrateRoot(
    c,
    <main>
      <React.Suspense fallback={<i>waiting</i>}>
        <div>
          <Pending />
        </div>
      </React.Suspense>
      <button onClick={click}>ready</button>
    </main>,
    { onRecoverableError: error }
  );
  try {
    await until(() => attempts > 0);
    c.querySelector("button")!.click();
    await wait();
    expect(click).toHaveBeenCalledTimes(1);
    expect(before.every((n) => c.contains(n))).toBe(true);
    resolve("ready");
    await wait();
    await wait();
    expect(error).not.toHaveBeenCalled();
    expect(before.every((n) => c.contains(n))).toBe(true);
  } finally {
    flushSync(() => root.unmount());
    c.remove();
  }
});
it("does not resume an initial hydration after unmount", async () => {
  const c = document.createElement("div");
  c.innerHTML = "<div><nav>nav</nav></div>";
  let resolve!: (value: string) => void,
    attempts = 0;
  const p = new Promise<string>((yes) => (resolve = yes)),
    effect = vi.fn(),
    error = vi.fn();
  function Pending() {
    attempts++;
    React.use(p);
    React.useEffect(effect, []);
    return <nav>nav</nav>;
  }
  const root = hydrateRoot(
    c,
    <div>
      <Pending />
    </div>,
    { onRecoverableError: error }
  );
  await until(() => attempts > 0);
  flushSync(() => root.unmount());
  resolve("ready");
  await wait();
  await wait();
  expect(c.textContent).toBe("");
  expect(effect).not.toHaveBeenCalled(); // Native may report its early-unmount cancellation, but settlement must not run effects.
});

it.each([false, true])(
  "retains a manually suspending class under a host, boundary=%s",
  async (boundary) => {
    const c = document.createElement("div");
    c.innerHTML = boundary
      ? "<main><!--$--><div><nav>nav</nav><span>after</span></div><!--/$--><button>ready</button></main>"
      : "<div><nav>nav</nav><span>after</span></div>";
    document.body.append(c);
    const before = Array.from(c.querySelectorAll("*")),
      error = vi.fn(),
      click = vi.fn(),
      mount = vi.fn();
    let ready = false,
      attempts = 0,
      resolve!: () => void;
    const p = new Promise<void>((yes) => (resolve = yes));
    class Pending extends React.Component {
      componentDidMount() {
        mount();
      }
      render() {
        attempts++;
        if (!ready) throw p;
        return <nav>nav</nav>;
      }
    }
    const child = (
        <div>
          <Pending />
          <span>after</span>
        </div>
      ),
      view = boundary ? (
        <main>
          <React.Suspense fallback={<i>waiting</i>}>{child}</React.Suspense>
          <button onClick={click}>ready</button>
        </main>
      ) : (
        child
      );
    const root = hydrateRoot(c, view, { onRecoverableError: error });
    try {
      await until(() => attempts > 0);
      expect(mount).not.toHaveBeenCalled();
      if (boundary) {
        c.querySelector("button")!.click();
        await wait();
        expect(click).toHaveBeenCalledTimes(1);
      }
      ready = true;
      resolve();
      await until(() => mount.mock.calls.length > 0);
      expect(error).not.toHaveBeenCalled();
      expect(before.every((n) => c.contains(n))).toBe(true);
      expect(mount).toHaveBeenCalledTimes(1);
    } finally {
      ready = true;
      resolve();
      flushSync(() => root.unmount());
      c.remove();
    }
  }
);
it("keeps boundary effects transactional across two pending sources", async () => {
  const c = document.createElement("div");
  c.innerHTML =
    "<main><!--$--><div><span>before</span><nav>nav</nav></div><!--/$--><button>ready</button></main>";
  document.body.append(c);
  const before = Array.from(c.querySelectorAll("*")),
    effect = vi.fn(),
    error = vi.fn(),
    click = vi.fn();
  let first!: (v: string) => void,
    second!: (v: string) => void,
    attempts = 0;
  const p1 = new Promise<string>((yes) => (first = yes)),
    p2 = new Promise<string>((yes) => (second = yes));
  function Ready() {
    React.useLayoutEffect(effect, []);
    return <span>before</span>;
  }
  function Pending() {
    attempts++;
    React.use(p1);
    React.use(p2);
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
    await until(() => attempts > 0);
    expect(effect).not.toHaveBeenCalled();
    const initial = attempts;
    first("one");
    await until(() => attempts > initial);
    expect(effect).not.toHaveBeenCalled();
    c.querySelector("button")!.click();
    await wait();
    expect(click).toHaveBeenCalledTimes(1);
    second("two");
    await until(() => effect.mock.calls.length > 0);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(before.every((n) => c.contains(n))).toBe(true);
  } finally {
    first("one");
    second("two");
    flushSync(() => root.unmount());
    c.remove();
  }
});

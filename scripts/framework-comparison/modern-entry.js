import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
const h = React.createElement,
  tick = () => new Promise((r) => setTimeout(r, 60));
const results = {};
const container = document.getElementById("root");
async function scenario(name, run) {
  try {
    results[name] = await run();
  } catch (e) {
    results[name] = { error: String(e.stack || e) };
  }
}
globalThis.modernResult = (async () => {
  await scenario("transitionRetention", async () => {
    let done = false,
      release,
      begin;
    const promise = new Promise((r) => (release = r));
    function Result({ value }) {
      if (value && !done) throw promise;
      return h("b", null, value);
    }
    function App() {
      const [value, set] = React.useState(0),
        [pending, start] = React.useTransition();
      begin = () => start(() => set(1));
      return h(
        React.Fragment,
        null,
        h("output", null, String(pending)),
        h(React.Suspense, { fallback: "Loading" }, h(Result, { value })),
      );
    }
    const root = createRoot(container);
    flushSync(() => root.render(h(App)));
    begin();
    await tick();
    const pending = container.textContent;
    done = true;
    release();
    for (let i = 0; i < 20 && container.textContent !== "false1"; i++)
      await tick();
    const settled = container.textContent;
    root.unmount();
    await tick();
    return {
      pending,
      settled,
      passed: pending === "true0" && settled === "false1",
    };
  });
  await scenario("deferredRetention", async () => {
    let done = false,
      release,
      update;
    const promise = new Promise((r) => (release = r));
    function Result({ value }) {
      if (value === "beta" && !done) throw promise;
      return h("b", null, value);
    }
    function App() {
      const [query, set] = React.useState("alpha");
      update = set;
      const value = React.useDeferredValue(query);
      return h(
        React.Fragment,
        null,
        h("output", null, query + ":"),
        h(React.Suspense, { fallback: "Loading" }, h(Result, { value })),
      );
    }
    const root = createRoot(container);
    flushSync(() => root.render(h(App)));
    update("beta");
    await tick();
    const pending = container.textContent;
    done = true;
    release();
    for (let i = 0; i < 20 && container.textContent !== "beta:beta"; i++)
      await tick();
    const settled = container.textContent;
    root.unmount();
    await tick();
    return {
      pending,
      settled,
      passed: pending === "beta:alpha" && settled === "beta:beta",
    };
  });
  // Namespace indexing records missing exports without preventing unrelated
  // scenarios from compiling. Missing APIs never count as successful behavior.
  for (const name of [
    "useActionState",
    "useOptimistic",
    "Activity",
    "ViewTransition",
  ])
    results[name] = { available: typeof React[name] !== "undefined" };
  if (typeof React["useActionState"] === "function")
    await scenario("actionState", async () => {
      let release, submit;
      const promise = new Promise((r) => (release = r));
      function App() {
        const [value, action, pending] = React["useActionState"](
          async (v, n) => {
            await promise;
            return v + n;
          },
          0,
        );
        submit = () => React.startTransition(() => action(2));
        return h("output", null, value + ":" + pending);
      }
      const root = createRoot(container);
      flushSync(() => root.render(h(App)));
      submit();
      await tick();
      const pending = container.textContent;
      release();
      for (let i = 0; i < 20 && container.textContent !== "2:false"; i++)
        await tick();
      const settled = container.textContent;
      root.unmount();
      await tick();
      return {
        pending,
        settled,
        passed: pending === "0:true" && settled === "2:false",
      };
    });
  return results;
})();

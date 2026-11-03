import { expect, it } from "vitest";
import * as R from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
const tick = () => new Promise((r) => setTimeout(r, 15));
it("keeps an effect title across unchanged renders, then applies a changed title", async () => {
  const previous = document.head.innerHTML;
  document.head.innerHTML = "";
  const c = document.createElement("div");
  document.body.append(c);
  const root = createRoot(c);
  function Home() {
    R.useEffect(() => {
      document.title = "Dashboard";
    }, []);
    return <p>home</p>;
  }
  const view = (title: string, tick: number) => (
    <div>
      <title>{title}</title>
      <Home />
      <button>{tick}</button>
    </div>
  );
  try {
    flushSync(() => root.render(view("Landing", 0)));
    await tick();
    expect(document.title).toBe("Dashboard");
    const title = document.querySelector("title")!,
      replacement = title.firstChild;
    flushSync(() => root.render(view("Landing", 1)));
    expect(document.title).toBe("Dashboard");
    expect(title.firstChild).toBe(replacement);
    flushSync(() => root.render(view("Changed", 2)));
    expect(document.title).toBe("Changed");
  } finally {
    flushSync(() => root.unmount());
    c.remove();
    document.head.innerHTML = previous;
  }
});
it("keeps a browser-replaced ordinary text node on an unchanged render", () => {
  const c = document.createElement("div"),
    root = createRoot(c);
  const view = (value: string) => <span>{value}</span>;
  try {
    flushSync(() => root.render(view("rendered")));
    c.querySelector("span")!.textContent = "external";
    const replacement = c.querySelector("span")!.firstChild;
    flushSync(() => root.render(view("rendered")));
    expect(c.textContent).toBe("external");
    expect(c.querySelector("span")!.firstChild).toBe(replacement);
    flushSync(() => root.render(view("changed")));
    expect(c.textContent).toBe("changed");
  } finally {
    flushSync(() => root.unmount());
  }
});

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const base = resolve(process.env.MATRIX_ROOT || "/tmp/redact-framework-matrix");
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.MATRIX_TOOLS_ROOT || base,
      "node_modules/playwright/index.mjs",
    ),
  )
);
const out = resolve(
  process.env.MATRIX_OUT || "benchmarks/results/framework-comparison",
);
mkdirSync(out, { recursive: true });
const names = (
  process.env.MATRIX_CASES ||
  "vite18,vite19,router-data,router-framework,start,next-pages,next-app,vinext"
).split(",");
const runtimes = (process.env.MATRIX_RUNTIMES || "react,preact,redact").split(
  ",",
);
const modes = (process.env.MATRIX_MODES || "development,production").split(",");
const browser = await chromium.launch({ headless: true });
const results = [];
let port = Number(process.env.MATRIX_PORT || 4420);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function launch(cwd, args, env, record) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.on("data", (d) => (record.log += d));
  child.stderr.on("data", (d) => (record.log += d));
  return child;
}
async function stop(child) {
  if (!child) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await delay(250);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
}
async function finish(child, timeout) {
  const start = Date.now();
  while (child.exitCode === null && child.signalCode === null) {
    if (Date.now() - start > timeout) throw Error("Build timed out");
    await delay(200);
  }
  assert.equal(child.exitCode, 0, "Build failed");
}
try {
  for (const name of names)
    for (const runtime of runtimes)
      for (const mode of modes) {
        const cwd = resolve(
            base,
            (name.endsWith("18") ? "react18/" + name : name) +
              (process.env.MATRIX_VARIANT || ""),
          ),
          bundler = name.startsWith("next")
            ? process.env.MATRIX_BUNDLER || "webpack"
            : null,
          key = `${name}-${runtime}-${mode}${bundler === "turbopack" ? "-turbopack" : ""}`;
        const record = {
          name,
          runtime,
          mode,
          bundler,
          node: process.version,
          configSha256: createHash("sha256")
            .update(
              readFileSync(
                resolve(
                  cwd,
                  name.startsWith("next")
                    ? "next.config.mjs"
                    : "vite.config.mjs",
                ),
              ),
            )
            .digest("hex"),
          passed: false,
          checks: [],
          log: "",
          browser: browser.version(),
          started: new Date().toISOString(),
        };
        let server, build, page;
        const p = String(++port),
          origin = `http://127.0.0.1:${p}`,
          env = { RUNTIME: runtime, PORT: p };
        const bin = (tool) =>
          resolve(
            base,
            name.endsWith("18") ? "react18" : "",
            "node_modules",
            tool,
          );
        try {
          for (const folder of [".next", "dist", "build", "node_modules/.vite"])
            rmSync(resolve(cwd, folder), { recursive: true, force: true });
          const next = name.startsWith("next"),
            rr = name === "router-framework",
            vinext = name === "vinext";
          let dev = next
            ? [bin("next/dist/bin/next"), "dev", "--" + bundler, "--port", p]
            : rr
              ? [
                  bin("@react-router/dev/bin.cjs"),
                  "dev",
                  "--host",
                  "127.0.0.1",
                  "--port",
                  p,
                ]
              : [bin("vite/bin/vite.js"), "--host", "127.0.0.1", "--port", p];
          if (mode === "production") {
            const args = next
              ? [bin("next/dist/bin/next"), "build", "--" + bundler]
              : rr
                ? [bin("@react-router/dev/bin.cjs"), "build"]
                : vinext
                  ? [bin("vinext/dist/cli.js"), "build"]
                  : [bin("vite/bin/vite.js"), "build"];
            build = launch(cwd, args, env, record);
            await finish(build, 120000);
            record.checks.push("production build");
            dev = next
              ? [bin("next/dist/bin/next"), "start", "--port", p]
              : rr
                ? [bin("@react-router/serve/bin.cjs"), "build/server/index.js"]
                : vinext
                  ? [bin("vinext/dist/cli.js"), "start", "--port", p]
                  : [
                      bin("vite/bin/vite.js"),
                      "preview",
                      "--host",
                      "127.0.0.1",
                      "--port",
                      p,
                    ];
          }
          server = launch(cwd, dev, env, record);
          let response;
          const start = Date.now();
          while (Date.now() - start < 45000) {
            if (server.exitCode !== null) throw Error("Server exited");
            try {
              response = await fetch(origin, {
                signal: AbortSignal.timeout(3000),
              });
              if (response.ok) break;
            } catch {}
            await delay(300);
          }
          assert.ok(response?.ok, `HTTP startup failed: ${response?.status}`);
          const html = await response.text();
          const ssr = !["vite18", "vite19", "router-data"].includes(name);
          if (ssr) {
            assert.match(
              html,
              /Count <!-- -->0|Count 0|Count <!-- --><!-- -->0/,
              "SSR counter missing",
            );
            record.checks.push("SSR HTML");
          }
          page = await browser.newPage();
          if (ssr)
            await page.addInitScript(() => {
              const watch = new MutationObserver(() => {
                const node = document.querySelector("#counter");
                if (node) {
                  window.matrixServerCounter = node;
                  watch.disconnect();
                }
              });
              watch.observe(document, { childList: true, subtree: true });
            });
          const errors = [];
          record.browserErrors = errors;
          record.consoleErrors = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") record.consoleErrors.push(msg.text());
          });
          page.on("pageerror", (e) => errors.push(e.stack || e.message));
          await page.goto(origin, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page.waitForFunction(
            () => document.documentElement.dataset.hydrated === "yes",
            {},
            { timeout: 12000 },
          );
          if (ssr) {
            record.hydration = await page.evaluate(() => ({
              captured: !!window.matrixServerCounter,
              same:
                window.matrixServerCounter ===
                document.querySelector("#counter"),
              originalConnected: window.matrixServerCounter?.isConnected,
              original: window.matrixServerCounter?.outerHTML,
              current: document.querySelector("#counter")?.outerHTML,
            }));
            if (record.hydration.same)
              record.checks.push("server DOM adoption");
          }
          record.identity = await page.evaluate(() => window.matrixRuntime);
          assert.equal(
            record.identity.elementKeys.includes("__k"),
            runtime === "preact",
            "Browser runtime did not match requested renderer",
          );
          if (runtime === "redact")
            assert.ok(
              !record.identity.elementKeys.includes("_owner"),
              "Native React was not replaced",
            );
          record.checks.push("browser runtime identity");
          await page.locator("#counter").click();
          await page.waitForFunction(
            () => document.querySelector("#counter")?.textContent === "Count 1",
            {},
            { timeout: 6000 },
          );
          record.checks.push("interactive state");
          if (name.startsWith("start"))
            assert.equal(
              await page.locator("h1").textContent(),
              "server function worked",
            );
          if (name === "router-framework") {
            await page.getByRole("button", { name: "Submit action" }).click();
            await page.waitForFunction(
              () =>
                document.querySelector("output")?.textContent ===
                "action worked",
              {},
              { timeout: 8000 },
            );
            record.checks.push("server form action");
          }
          if (!name.startsWith("vite")) {
            await page.evaluate(() => (window.navigationSentinel = "retained"));
            await page
              .getByRole("link", { name: "Other", exact: true })
              .click();
            await page.waitForURL("**/other", { timeout: 12000 });
            await page.waitForFunction(
              () =>
                document
                  .querySelector("h1")
                  ?.textContent?.includes("Other page") ||
                document.querySelector("h1")?.textContent === "loader worked",
              {},
              { timeout: 8000 },
            );
            assert.equal(
              await page.evaluate(() => window.navigationSentinel),
              "retained",
              "Navigation reloaded document",
            );
            await page.goBack();
            await page.waitForURL((url) => url.pathname === "/", {
              timeout: 8000,
            });
            record.checks.push("client navigation and history");
          }
          assert.deepEqual(errors, [], "Browser errors");
          record.checks.push("no uncaught browser errors");
          assert.ok(
            record.hydration?.same !== false,
            "Server DOM was replaced during hydration",
          );
          record.passed = true;
        } catch (error) {
          record.error = String(error.stack || error);
          if (page)
            record.body = (
              await page
                .locator("body")
                .innerText()
                .catch(() => "")
            ).slice(0, 3000);
        } finally {
          await page?.close();
          await stop(server);
          await stop(build);
          record.finished = new Date().toISOString();
          writeFileSync(resolve(out, key + ".log"), record.log);
          delete record.log;
          writeFileSync(
            resolve(out, key + ".json"),
            JSON.stringify(record, null, 2),
          );
          results.push(record);
          console.log(
            key + ": " + (record.passed ? "PASS" : record.error.split("\n")[0]),
          );
        }
      }
} finally {
  await browser.close();
  writeFileSync(
    resolve(out, "summary-" + Date.now() + ".json"),
    JSON.stringify(results, null, 2),
  );
}

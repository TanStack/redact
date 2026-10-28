import { readFileSync, writeFileSync, cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const base = resolve(process.env.MATRIX_ROOT || "/tmp/redact-framework-matrix"),
  out = resolve("benchmarks/results/framework-comparison");
const load = (path) =>
  import(pathToFileURL(resolve(base, "node_modules", path)));
const { build } = await load("vite/dist/node/index.js");
const { chromium } = await load("playwright/index.mjs");
const { default: preact } = await load(
  "@preact/preset-vite/dist/esm/index.mjs",
);
const { redact } = await load("@tanstack/redact/dist/vite/index.js");
const browser = await chromium.launch({ headless: true }),
  results = [];
try {
  for (const version of ["18", "19"])
    for (const mode of ["development", "production"]) {
      const root = resolve(base, version === "18" ? "react18" : "");
      cpSync(
        new URL("./modern-entry.js", import.meta.url),
        resolve(root, "modern-entry.js"),
      );
      let control;
      for (const runtime of ["react", "preact", "redact"]) {
        const result = { version, mode, runtime, passed: false };
        try {
          const output = await build({
            root,
            configFile: false,
            logLevel: "silent",
            plugins:
              runtime === "preact"
                ? [preact()]
                : runtime === "redact"
                  ? [redact({ resolveFrom: root })]
                  : [],
            define: { "process.env.NODE_ENV": JSON.stringify(mode) },
            build: {
              write: false,
              minify: true,
              lib: {
                entry: resolve(root, "modern-entry.js"),
                formats: ["iife"],
                name: "CoreCheck",
              },
            },
          });
          const page = await browser.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          try {
            await page.setContent(
              '<div id="root"></div><div id="portal"></div>',
            );
            await page.addScriptTag({
              content: [output]
                .flat()
                .flatMap((b) => b.output)
                .find((f) => f.type === "chunk").code,
            });
            result.observed = await page.evaluate(
              () => globalThis.modernResult,
            );
            result.errors = errors;
            if (runtime === "react") control = result.observed;
            result.differences = Object.keys(control || {}).filter(
              (k) =>
                k !== "version" &&
                control[k]?.available !== false &&
                JSON.stringify(control[k]) !==
                  JSON.stringify(result.observed[k]),
            );
            result.passed =
              !!control &&
              result.differences.length === 0 &&
              errors.length === 0;
          } finally {
            await page.close();
          }
        } catch (error) {
          result.error = String(error.stack || error);
        }
        results.push(result);
        writeFileSync(
          resolve(out, "modern.json"),
          JSON.stringify(results, null, 2),
        );
        console.log(
          `modern React ${version} ${runtime} ${mode}: ${result.passed ? "PASS" : JSON.stringify(result.differences || result.error)}`,
        );
      }
    }
} finally {
  await browser.close();
}

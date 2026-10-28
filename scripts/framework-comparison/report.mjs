import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve("benchmarks/results/framework-comparison");
const cases = [
  ["vite18", "Vite 8.3.5 + React 18.3.1"],
  ["vite19", "Vite 8.3.5 + React 19.3.1"],
  ["router-data", "React Router 8.5.0, data mode + React 19.3.1"],
  ["router-framework", "React Router 8.5.0, framework SSR + React 19.3.1"],
  ["start18", "TanStack Start 1.169.4 + React 18.3.1"],
  ["start", "TanStack Start 1.169.4 + React 19.3.1"],
  ["next-pages18", "Next 16.4.3 Pages + React 18.3.1, Webpack"],
  ["next-pages", "Next 16.4.3 Pages + React 19.3.1, Webpack"],
  ["next-app", "Next 16.4.3 App Router, Webpack"],
  ["vinext", "Vinext 1.3.0 App Router + React 19.3.1"],
  ["next-pages18", "Next 16.4.3 Pages + React 18.3.1, Turbopack", "turbopack"],
  ["next-pages", "Next 16.4.3 Pages + React 19.3.1, Turbopack", "turbopack"],
  ["next-app", "Next 16.4.3 App Router, Turbopack", "turbopack"],
];
const runtimes = ["react", "preact", "redact"],
  modes = ["development", "production"];
const rows = [],
  records = [];
for (const [name, label, bundler] of cases) {
  const row = { name, label, bundler: bundler || null, results: {} };
  for (const runtime of runtimes) {
    const runs = modes.map((mode) => {
      const file = `${name}-${runtime}-${mode}${bundler ? "-" + bundler : ""}.json`;
      const source = name === "router-framework" && runtime !== "preact"
        ? `release-0.2.3/${file}` : file;
      assert.ok(
        existsSync(resolve(directory, source)),
        `Missing result: ${file}`,
      );
      if (source !== file) {
        const baseline = JSON.parse(readFileSync(resolve(directory, file), "utf8"));
        const followUp = JSON.parse(readFileSync(resolve(directory, source), "utf8"));
        assert.equal(followUp.configSha256, baseline.configSha256, "Follow-up fixture config changed");
        assert.equal(followUp.passed, true, "Published hydration follow-up failed");
      }
      const result = JSON.parse(readFileSync(resolve(directory, source), "utf8"));
      assert.equal(result.name, name);
      assert.equal(result.runtime, runtime);
      assert.equal(result.mode, mode);
      assert.ok(result.configSha256, `Missing source identity: ${file}`);
      records.push({ file: source, runtimeVersion: runtime === "redact" ? (source.startsWith("release-") ? "0.2.3" : "0.2.1") : undefined, ...result });
      return result;
    });
    assert.equal(
      runs[0].configSha256,
      runs[1].configSha256,
      `${label} ${runtime}: config changed between modes`,
    );
    row.results[runtime] = {
      passed: runs.every((r) => r.passed),
      modes: runs.map((r) => ({
        mode: r.mode,
        passed: r.passed,
        error: r.error || null,
      })),
    };
  }
  rows.push(row);
}
const failedControls = records.filter(
  (r) => r.runtime === "react" && !r.passed,
);
assert.equal(
  failedControls.length,
  0,
  "Native controls must pass before making comparative claims",
);
const report = {
  recorded: "2026-10-28",
  baselineDate: "2026-10-27",
  followUp: "React Router framework mode: published Redact 0.2.3 and native React, both modes, October 28, Node 24.22.0. Other records remain the original snapshot.",
  scope:
    "Pinned Chromium fixtures, development and production. A failed replacement or hydration check is not proof that no custom integration is possible.",
  expected: cases.length * 3 * 2,
  executed: records.length,
  passed: records.filter((r) => r.passed).length,
  failed: records.filter((r) => !r.passed).length,
  rows,
  records,
};
writeFileSync(
  resolve(directory, "matrix.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const markdown = [
  "| Fixture | React control | Preact 11.1.0 | Redact 0.2.1; SSR row 0.2.3 |",
  "|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.label} | ${runtimes.map((runtime) => (r.results[runtime].passed ? "✅" : "❌")).join(" | ")} |`,
  ),
].join("\n");
writeFileSync(resolve(directory, "matrix.md"), markdown + "\n");
console.log(
  JSON.stringify({
    expected: report.expected,
    executed: report.executed,
    passed: report.passed,
    failed: report.failed,
  }),
);
console.log(markdown);

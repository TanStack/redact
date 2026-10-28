import { cpSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const base = resolve(process.env.MATRIX_ROOT || "/tmp/redact-framework-matrix");
for (const name of ["next-pages", "next-app"]) {
  const source = resolve(base, name),
    target = resolve(base, "official-preact", name);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (path) =>
      !path
        .split("/")
        .some((part) =>
          ["node_modules", ".next", "dist", "build"].includes(part),
        ),
  });
  writeFileSync(
    resolve(target, "package.json"),
    readFileSync(resolve(base, "official-preact/package.json")),
  );
  writeFileSync(
    resolve(target, "next.config.mjs"),
    `import withPreact from 'next-plugin-preact';export default withPreact({allowedDevOrigins:['127.0.0.1'],agentRules:false,experimental:{cpus:2},turbopack:{}});`,
  );
}

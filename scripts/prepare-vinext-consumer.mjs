import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Packs Redact and creates a clean npm consumer for Vinext compatibility tests.
 *
 * @param destination Empty directory, or an existing Redact test consumer.
 */
export async function prepareVinextConsumer(destination) {
  const directory = destination || await mkdtemp(join(tmpdir(), 'redact-vinext-consumer-'))
  await mkdir(directory, { recursive: true })
  if ((await readdir(directory)).length) {
    const existing = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8').catch(() => 'null'))
    assert.equal(existing?.name, 'redact-vinext-consumer', 'Use an empty directory or an existing Redact test consumer')
  }
  const source = join(root, 'examples/vinext-demo')
  const packageRoot = resolve(process.env.VINEXT_TEST_PACKAGE || join(root, 'packages/redact'))
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  if (process.env.VINEXT_TEST_VERSION) pkg.dependencies.vinext = process.env.VINEXT_TEST_VERSION
  const redact = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const packed = spawn('pnpm', ['pack', '--pack-destination', directory], { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  let packLog = ''
  for (const stream of [packed.stdout, packed.stderr]) stream.on('data', data => { packLog += data })
  assert.equal((await once(packed, 'exit'))[0], 0, packLog)
  const tarball = join(directory, `tanstack-redact-${redact.version}.tgz`)
  const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex')
  const packedName = `redact-${sha256.slice(0, 16)}.tgz`
  await rename(tarball, join(directory, packedName))
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    name: 'redact-vinext-consumer', private: true, type: 'module',
    dependencies: { ...pkg.dependencies, '@tanstack/redact': `file:./${packedName}` },
    devDependencies: pkg.devDependencies,
    overrides: pkg.overrides,
  }, null, 2) + '\n')
  for (const name of ['vite.config.mjs', 'next.config.mjs', 'wrangler.jsonc', 'fixtures']) await cp(join(source, name), join(directory, name), { recursive: true })
  // npm installs the package a consumer receives, without workspace patches or links.
  await rm(join(directory, 'node_modules'), { recursive: true, force: true })
  const install = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: directory, stdio: 'inherit' })
  assert.equal((await once(install, 'exit'))[0], 0, 'Could not install the Vinext consumer')
  await writeFile(join(directory, 'package-evidence.json'), JSON.stringify({ tarball: packedName, sha256, patches: false, overrides: pkg.overrides }, null, 2) + '\n')
  return directory
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`VINEXT_TEST_CONSUMER=${await prepareVinextConsumer(process.argv[2] && resolve(process.argv[2]))}`)

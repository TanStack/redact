// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, cpSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { compatibilitySizeAllowance } from '../scripts/compatibility-size-budget.mjs'

const base = '89f2bfc58135fdf5fcb29af4c346680e0eda2763'
const nano = { profile: 'nano', entry: 'client-total', target: 'react19' }
it('limits the approved comparison to its exact base and metric', () => {
  expect(compatibilitySizeAllowance(base, nano, 'brotli')).toBe(47)
  expect(compatibilitySizeAllowance(base, nano, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'min')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'constructor')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'toString')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', nano, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(undefined, nano, 'brotli')).toBe(0)
})
it('keeps unapproved profiles and targets at zero growth', () => {
  expect(compatibilitySizeAllowance(base, { ...nano, profile: 'default' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...nano, target: 'react18' }, 'brotli')).toBe(11)
  expect(compatibilitySizeAllowance(base, { ...nano, entry: 'react/index' }, 'brotli')).toBe(0)
})

it('limits the inline metadata allowance to the approved 16-byte Brotli comparison', () => {
  const base = '0c7274e17a3fade8396169bc6ed024903cd1252d'
  const row = { profile: 'full', entry: 'client-total', target: 'react19' }
  expect(compatibilitySizeAllowance(base, row, 'brotli')).toBe(16)
  expect(compatibilitySizeAllowance(base, row, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance(base, row, 'min')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...row, target: 'react18' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...row, profile: 'default' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', row, 'brotli')).toBe(0)
})

const hydrationBase = '82da568053c186552325a12fdd48a1fb32e27dc1'
const hydrationRows: Array<{profile:string;entry:string;target:string;allowance:Record<string,number>}> = [
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react19",
    "allowance": {
      "brotli": 82
    }
  },
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react18",
    "allowance": {
      "brotli": 4
    }
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react19",
    "allowance": {
      "gzip": 1
    }
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react18",
    "allowance": {
      "brotli": 42
    }
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react19",
    "allowance": {
      "brotli": 26
    }
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react18",
    "allowance": {
      "brotli": 27
    }
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react19",
    "allowance": {
      "gzip": 1
    }
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react18",
    "allowance": {
      "gzip": 2,
      "brotli": 20
    }
  }
]
it.each(hydrationRows)('limits the hydration split allowance to $profile $entry $target', ({profile,entry,target,allowance}) => {
  const row={profile,entry,target}
  for(const metric of ['min','gzip','brotli'])
    expect(compatibilitySizeAllowance(hydrationBase,row,metric)).toBe(allowance[metric] ?? 0)
  expect(compatibilitySizeAllowance('another-base',row,'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(hydrationBase,{...row,profile:'nano'},'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(hydrationBase,row,'constructor')).toBe(0)
})
it('does not transfer the hydration allowance to changed source files',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'redact-hydration-allowance-'))
  const files=["packages/redact/src", "packages/redact/package.json", "scripts/build.mjs", "scripts/measure-size.mjs", "pnpm-lock.yaml", ".nvmrc", ".changeset/strip-streamed-hydration.md"]
  try {
    for(const file of ['scripts/compatibility-size-budget.mjs',...files]) {
      const destination=resolve(root,file);mkdirSync(dirname(destination),{recursive:true});cpSync(resolve(import.meta.dirname,'..',file),destination,{recursive:true})
    }
    const script=`const {compatibilitySizeAllowance}=await import(${JSON.stringify(pathToFileURL(resolve(root,'scripts/compatibility-size-budget.mjs')).href)});console.log(compatibilitySizeAllowance('${hydrationBase}',{profile:'full',entry:'dom/client',target:'react19'},'brotli'))`
    const read=()=>Number(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}).trim())
    expect(read()).toBe(82)
    appendFileSync(resolve(root,'packages/redact/src/dom/features/suspense-hydration/full.ts'),'\n// changed packet\n')
    expect(read()).toBe(0)
  } finally {rmSync(root,{recursive:true,force:true})}
})

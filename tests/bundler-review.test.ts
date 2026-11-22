import {expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {resolveSpecifier} from '../packages/redact/src/bundler-core/resolution'
import {redact} from '../packages/redact/src/webpack/index'

it('falls through an unsupported nested import condition to the default export',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'redact-exports-')))
 try{
  writeFileSync(join(root,'browser.js'),'')
  writeFileSync(join(root,'package.json'),JSON.stringify({exports:{'.':{import:{node:'./node.js'},default:'./browser.js'},'./subpath':{import:{node:'./node.js'},default:'./browser.js'}}}))
  expect(resolveSpecifier('@tanstack/redact',root,{'@tanstack/redact':root})).toBe(join(root,'browser.js'))
  expect(resolveSpecifier('@tanstack/redact/subpath',root,{'@tanstack/redact':root})).toBe(join(root,'browser.js'))
 }finally{rmSync(root,{recursive:true,force:true})}
})

it('respects explicit resolution roots before the plugin dependency installation',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'redact-resolve-from-')))
 try{
  const pkg=join(root,'node_modules/magic-string');mkdirSync(pkg,{recursive:true});writeFileSync(join(pkg,'local.js'),'')
  writeFileSync(join(pkg,'package.json'),JSON.stringify({exports:{'.':'./local.js'}}))
  expect(resolveSpecifier('magic-string',root,{},true)).toBe(join(pkg,'local.js'))
 }finally{rmSync(root,{recursive:true,force:true})}
})

function fixture(run:(root:string,include:(file:string)=>boolean)=>void){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'redact-custom-layout-')))
 try{
  mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist/index.js'),'')
  const exports:Record<string,string>={}
  for(const name of ['', 'jsx-runtime','jsx-dev-runtime','compiler-runtime','dom-client','dom','dom-profiling','server','dom-test-utils','scheduler'])exports[name?'./'+name:'.']='./dist/index.js'
  writeFileSync(join(root,'package.json'),JSON.stringify({exports}))
  mkdirSync(join(root,'node_modules/react'),{recursive:true});writeFileSync(join(root,'node_modules/react/package.json'),JSON.stringify({version:'18.3.1'}))
  const rules:Array<{include:(file:string)=>boolean}>=[]
  redact({packageRoots:{'@tanstack/redact':root}}).apply({context:root,options:{target:'web',resolve:{},module:{rules}},hooks:{normalModuleFactory:{tap(){}}}})
  run(root,rules[0]!.include)
 }finally{rmSync(root,{recursive:true,force:true})}
}
it('uses the explicit package root even with a flat dist export',()=>fixture((root,include)=>expect(include(join(root,'dist/index.js'))).toBe(true)))
it('does not throw while matching a virtual JavaScript module',()=>fixture((root,include)=>expect(include(join(root,'missing-virtual.js'))).toBe(false)))

import {expect,it} from 'vitest'
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {redact} from '../packages/redact/src/webpack/index'

it.each(['object','array'])('keeps feature imports in the selected package with %s aliases',form=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'redact-feature-alias-')))
 try{
  mkdirSync(join(root,'dist/react'),{recursive:true});writeFileSync(join(root,'dist/react/index.js'),'')
  const exports:Record<string,string>={}
  for(const name of ['', 'jsx-runtime','jsx-dev-runtime','compiler-runtime','dom-client','dom','dom-profiling','server','dom-test-utils','scheduler'])exports[name?'./'+name:'.']='./dist/react/index.js'
  writeFileSync(join(root,'package.json'),JSON.stringify({exports}))
  const alias:Record<string,string>|Array<{name:string;alias:string;onlyModule?:boolean}>=form==='array'
   ?[{name:'@tanstack/redact/features',alias:'/wrong-copy/features',onlyModule:false},{name:'application',alias:'/application'}]
   :{'@tanstack/redact/features':'/wrong-copy/features',application:'/application'}
  const compiler={context:root,options:{target:'web',resolve:{alias},module:{rules:[]}},hooks:{normalModuleFactory:{tap(){}}}}
  redact({packageRoots:{'@tanstack/redact':root},preset:'nano'}).apply(compiler)
  const selected=compiler.options.resolve.alias
  if(Array.isArray(selected)){
   const feature=selected.find(entry=>entry.name==='@tanstack/redact/features')!
   expect(feature.alias).toBe(join(root,'dist/dom/features'));expect(feature.onlyModule).toBe(false)
   expect(selected.find(entry=>entry.name==='application')?.alias).toBe('/application')
  }else{
   expect(selected['@tanstack/redact/features']).toBe(join(root,'dist/dom/features'))
   expect(selected['@tanstack/redact/features$']).toBeUndefined()
   expect(selected.application).toBe('/application')
  }
 }finally{rmSync(root,{recursive:true,force:true})}
})

import { mkdirSync, writeFileSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
const base = resolve(process.argv[2] || "/tmp/redact-framework-matrix");
const write = (root, path, value) => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), value);
};
const counter = `'use client';
import {useState,useEffect,createElement,version} from 'react';
export default function Counter(){const [n,set]=useState(0);useEffect(()=>{document.documentElement.dataset.hydrated='yes';window.matrixRuntime={version,elementKeys:Object.keys(createElement('i'))}},[]);return <button id="counter" onClick={()=>set(n+1)}>Count {n}</button>}`;
const runtimeConfig = `import react from '@vitejs/plugin-react';import preact from '@preact/preset-vite';import {redact} from '@tanstack/redact/vite';
const runtime=process.env.RUNTIME||'react';const runtimePlugins=runtime==='preact'?[preact()]:[react(),...(runtime==='redact'?[redact()]:[])];`;
for (const fixture of [
  "vite18",
  "vite19",
  "router-data",
  "router-framework",
  "start",
  "next-pages",
  "next-app",
  "vinext",
  "start18",
  "next-pages18",
]) {
  const name =
    fixture === "start18"
      ? "start"
      : fixture === "next-pages18"
        ? "next-pages"
        : fixture;
  const is18 = fixture.endsWith("18");
  const root = resolve(base, is18 ? "react18/" + fixture : fixture);
  mkdirSync(root, { recursive: true });
  write(
    root,
    "package.json",
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        react: is18 ? "18.3.1" : "19.3.1",
        "react-dom": is18 ? "18.3.1" : "19.3.1",
        ...(name === "router-framework" ? { isbot: "5.2.2" } : {}),
      },
    }),
  );
  write(root, "Counter.jsx", counter);
  if (["vite18", "vite19", "router-data"].includes(name)) {
    write(
      root,
      "index.html",
      '<div id="root"></div><script type="module" src="/src.jsx"></script>',
    );
    write(
      root,
      "vite.config.mjs",
      runtimeConfig + `\nexport default {plugins:runtimePlugins};`,
    );
    const app =
      name === "router-data"
        ? `import {createBrowserRouter,RouterProvider,Link,useLoaderData} from 'react-router';const router=createBrowserRouter([{path:'/',element:<><h1>Home</h1><Counter/><Link to="/other">Other</Link></>},{path:'/other',loader:()=>({message:'loader worked'}),Component:()=> <><h1>{useLoaderData().message}</h1><Link to="/">Home</Link></>}]);const app=<RouterProvider router={router}/>;`
        : `const app=<><h1>Home</h1><Counter/></>;`;
    write(
      root,
      "src.jsx",
      `import React from 'react';import {createRoot} from 'react-dom/client';import Counter from './Counter';${app}createRoot(document.getElementById('root')).render(app);`,
    );
  }
  if (name === "start") {
    write(
      root,
      "vite.config.mjs",
      runtimeConfig +
        `\nimport {tanstackStart} from '@tanstack/react-start/plugin/vite';export default {ssr:{noExternal:[new RegExp('^@tanstack/')]},plugins:[tanstackStart(),...runtimePlugins]};`,
    );
    write(
      root,
      "src/router.tsx",
      `import {createRouter} from '@tanstack/react-router';import {routeTree} from './routeTree.gen';export function getRouter(){return createRouter({routeTree})}`,
    );
    write(
      root,
      "src/routes/__root.tsx",
      `import React from 'react';import {HeadContent,Scripts,Outlet,createRootRoute} from '@tanstack/react-router';export const Route=createRootRoute({component:()=> <html><head><HeadContent/></head><body><Outlet/><Scripts/></body></html>});`,
    );
    write(
      root,
      "src/routes/index.tsx",
      `import React from 'react';import {createFileRoute,Link} from '@tanstack/react-router';import {createServerFn} from '@tanstack/react-start';import Counter from '../../Counter';const message=createServerFn({method:'GET'}).handler(()=> 'server function worked');export const Route=createFileRoute('/')({loader:()=>message(),component:()=> <><h1>{Route.useLoaderData()}</h1><Counter/><Link to="/other">Other</Link></>});`,
    );
    write(
      root,
      "src/routes/other.tsx",
      `import React from 'react';import {createFileRoute,Link} from '@tanstack/react-router';export const Route=createFileRoute('/other')({component:()=> <><h1>Other page</h1><Link to="/">Home</Link></>});`,
    );
  }
  if (name === "router-framework") {
    write(
      root,
      "vite.config.mjs",
      runtimeConfig +
        `\nimport {reactRouter} from '@react-router/dev/vite';export default {ssr:{noExternal:['react-router']},server:{fs:{allow:['..']}},plugins:[reactRouter(),...(runtime==='redact'?[redact()]:runtime==='preact'?[preact({prefreshEnabled:false})]:[])]};`,
    );
    write(root, "react-router.config.ts", `export default {ssr:true};`);
    write(
      root,
      "app/root.tsx",
      `import React from 'react';import {Links,Meta,Outlet,Scripts,ScrollRestoration} from 'react-router';export default function Root(){return <html><head><Meta/><Links/></head><body><Outlet/><ScrollRestoration/><Scripts/></body></html>}`,
    );
    write(
      root,
      "app/routes.ts",
      `import {index,route} from '@react-router/dev/routes';export default [index('home.tsx'),route('other','other.tsx')];`,
    );
    write(
      root,
      "app/home.tsx",
      `import React from 'react';import {Link,useLoaderData,Form,useActionData} from 'react-router';import Counter from '../Counter';export async function loader(){return {message:'server loader worked'}};export async function action(){return {message:'action worked'}};export default function Home(){return <><h1>{useLoaderData().message}</h1><Counter/><Form method="post"><button>Submit action</button></Form><output>{useActionData()?.message}</output><Link to="/other">Other</Link></>}`,
    );
    write(
      root,
      "app/other.tsx",
      `import React from 'react';import {Link} from 'react-router';export default function Other(){return <><h1>Other page</h1><Link to="/">Home</Link></>}`,
    );
  }
  if (name.startsWith("next") || name === "vinext") {
    const app = name !== "next-pages";
    if (app) {
      write(
        root,
        "app/layout.jsx",
        `export default function Layout({children}){return <html><body>{children}</body></html>}`,
      );
      write(
        root,
        "app/page.jsx",
        `import Link from 'next/link';import Counter from '../Counter';export default function Home(){return <><h1>Server page</h1><Counter/><Link href="/other">Other</Link></>}`,
      );
      write(
        root,
        "app/other/page.jsx",
        `import Link from 'next/link';export default function Other(){return <><h1>Other page</h1><Link href="/">Home</Link></>}`,
      );
    } else {
      write(
        root,
        "pages/index.jsx",
        `import Link from 'next/link';import Counter from '../Counter';export function getServerSideProps(){return {props:{message:'server props worked'}}};export default function Home({message}){return <><h1>{message}</h1><Counter/><Link href="/other">Other</Link></>}`,
      );
      write(
        root,
        "pages/other.jsx",
        `import Link from 'next/link';export default function Other(){return <><h1>Other page</h1><Link href="/">Home</Link></>}`,
      );
    }
    write(
      root,
      "next.config.mjs",
      `import {withRedact} from '@tanstack/redact/next';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const runtime=process.env.RUNTIME;const aliases={'react':'preact/compat','react-dom':'preact/compat','react-dom/client':'preact/compat/client','react/jsx-runtime':'preact/jsx-runtime','react/jsx-dev-runtime':'preact/jsx-dev-runtime'};const turboAliases={};for(const [from,to] of Object.entries(aliases)){const target={browser:require.resolve(to)};turboAliases[from]=target;turboAliases['next/dist/compiled/'+from]=target;const parts=from.split('/');parts[0]+='-experimental';turboAliases['next/dist/compiled/'+parts.join('/')]=target}const config={turbopack:runtime==='preact'?{resolveAlias:turboAliases}:{},allowedDevOrigins:['127.0.0.1'],agentRules:false,experimental:{cpus:2},webpack(config,{isServer,webpack}){if(runtime==='preact'&&!isServer){const targets={};for(const [from,to] of Object.entries(aliases)){const target=require.resolve(to);targets[from]=target;targets['next/dist/compiled/'+from]=target;const parts=from.split('/');parts[0]+='-experimental';targets['next/dist/compiled/'+parts.join('/')]=target}config.plugins.push(new webpack.NormalModuleReplacementPlugin(/.*/,resource=>{if(targets[resource.request])resource.request=targets[resource.request]}))}return config}};export default runtime==='redact'?withRedact(config):config;`,
    );
    if (name === "vinext")
      write(
        root,
        "vite.config.mjs",
        `import {fileURLToPath} from 'node:url';import vinext from 'vinext';import {redact} from '@tanstack/redact/vinext';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const targets=Object.fromEntries(Object.entries({'react':'preact/compat','react-dom':'preact/compat','react-dom/client':'preact/compat/client','react/jsx-runtime':'preact/jsx-runtime','react/jsx-dev-runtime':'preact/jsx-dev-runtime'}).map(([a,b])=>[a,fileURLToPath(import.meta.resolve(b))]));const runtime=process.env.RUNTIME;export default {plugins:[vinext(),...(runtime==='redact'?[redact()]:runtime==='preact'?[{name:'preact-browser-aliases',enforce:'pre',resolveId:{order:'pre',handler(id){if(this.environment?.config.consumer==='client')return targets[id]}}}]:[])]};`,
      );
  }
}
console.log("Prepared fixtures in " + base);
for (const name of ["next-pages", "next-app", "next-pages18"]) {
  const source = resolve(base, name.endsWith("18") ? "react18/" + name : name);
  cpSync(source, source + "-turbopack", {
    recursive: true,
    filter: (path) =>
      !path
        .split("/")
        .some((part) =>
          ["node_modules", ".next", "dist", "build"].includes(part),
        ),
  });
}

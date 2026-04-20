import * as React from 'react'
import { StreamingDemo } from './sections/StreamingDemo'
import { CounterDemo } from './sections/CounterDemo'
import { TextInputDemo } from './sections/TextInputDemo'
import { TodoDemo } from './sections/TodoDemo'
import { HeavyRenderDemo } from './sections/HeavyRenderDemo'
import { ExternalStoreDemo } from './sections/ExternalStoreDemo'
import { ContextDemo } from './sections/ContextDemo'
import { ErrorBoundaryDemo } from './sections/ErrorBoundaryDemo'
import { StrictModeDemo } from './sections/StrictModeDemo'

export default function App() {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>tanstack-dom · playground</title>
        <style>{BASE_CSS}</style>
      </head>
      <body>
        <header>
          <h1>tanstack-dom playground</h1>
          <p class="sub">
            A React-compatible shim in ~8.9 KB gzip. Each section exercises a
            feature or surfaces a known shortcoming. Server-streams where
            annotated; the rest hydrates in place.
          </p>
        </header>

        <main>
          <Section label="good" title="Streaming SSR with Suspense">
            <StreamingDemo />
          </Section>

          <Section label="good" title="Interactive state + events">
            <CounterDemo />
          </Section>

          <Section label="watch" title="Text input — onChange vs native change">
            <TextInputDemo />
          </Section>

          <Section label="good" title="List reordering with keys">
            <TodoDemo />
          </Section>

          <Section label="watch" title="Heavy render — no scheduler, no yielding">
            <HeavyRenderDemo />
          </Section>

          <Section label="watch" title="External store — useSyncExternalStore under rapid updates">
            <ExternalStoreDemo />
          </Section>

          <Section label="good" title="Context propagation through deep tree">
            <ContextDemo />
          </Section>

          <Section label="good" title="Error boundary (class component)">
            <ErrorBoundaryDemo />
          </Section>

          <Section label="watch" title="StrictMode is a no-op">
            <StrictModeDemo />
          </Section>
        </main>

        <footer>
          <a href="https://github.com/tanstack/tanstack-dom">tanstack-dom</a>
          {' · '}
          <span>
            gray <code>watch</code> badges mark known divergences from React.
          </span>
        </footer>

        <script type="module" src="/src/entry-client.tsx" />
      </body>
    </html>
  )
}

function Section({
  title,
  label,
  children,
}: {
  title: string
  label: 'good' | 'watch'
  children: React.ReactNode
}) {
  return (
    <section class={`card ${label}`}>
      <h2>
        <span class={`badge ${label}`}>{label === 'good' ? 'good' : 'watch'}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: #0b0d10;
    color: #e6e8eb;
    line-height: 1.55;
  }
  header {
    padding: 2.5rem 2rem 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }
  header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
    letter-spacing: -0.02em;
  }
  header .sub {
    color: #98a2ad;
    margin: 0;
    max-width: 60ch;
  }
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 2rem 3rem;
    display: grid;
    gap: 1.25rem;
  }
  .card {
    background: #15181d;
    border: 1px solid #222830;
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
  }
  .card.watch { border-color: #3a3521; }
  .card h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 1rem;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .badge.good  { background: #14371c; color: #7fd39b; }
  .badge.watch { background: #3a3013; color: #e2c067; }
  button {
    background: #2a5fe8;
    color: white;
    border: 0;
    border-radius: 6px;
    padding: 0.45rem 0.9rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: #3570f5; }
  button:disabled { background: #333; cursor: not-allowed; }
  button.ghost { background: transparent; border: 1px solid #333; }
  input[type="text"], input[type="number"], textarea {
    background: #0f1216;
    color: inherit;
    border: 1px solid #2b313a;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    font-size: 0.95rem;
    font-family: inherit;
  }
  input[type="range"] { width: 100%; }
  code, pre, kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
  }
  code { background: #0f1216; padding: 0.1rem 0.35rem; border-radius: 4px; }
  .muted { color: #98a2ad; font-size: 0.9rem; }
  .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .stack { display: flex; flex-direction: column; gap: 0.5rem; }
  .pill {
    display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
    background: #1c2128; font-size: 0.8rem;
  }
  footer {
    padding: 2rem;
    text-align: center;
    color: #6d7680;
    font-size: 0.85rem;
    border-top: 1px solid #1b1f25;
  }
  footer a { color: #98a2ad; }
  .danger { color: #ff7a7a; }
  .ok { color: #7fd39b; }
  ul.todo {
    list-style: none; padding: 0; margin: 0.5rem 0 0;
    display: flex; flex-direction: column; gap: 0.35rem;
  }
  ul.todo li {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.7rem; background: #0f1216; border-radius: 6px;
  }
  ul.todo li .handle { color: #555; cursor: grab; user-select: none; }
  ul.todo li button { padding: 0.25rem 0.55rem; font-size: 0.8rem; }
  .heavy-canvas {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 1px;
    margin-top: 0.75rem;
  }
  .heavy-canvas > div {
    aspect-ratio: 1;
    border-radius: 2px;
  }
`

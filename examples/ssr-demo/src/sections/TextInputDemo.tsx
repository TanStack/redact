import * as React from 'react'

export function TextInputDemo() {
  const [native, setNative] = React.useState('')
  const [oninput, setOnInput] = React.useState('')

  return (
    <div class="stack">
      <p class="muted">
        <strong>Known divergence.</strong> In React, <code>onChange</code> on a
        text input fires on <em>every keystroke</em> (React remaps it to the
        native <code>input</code> event). In our shim, <code>onChange</code> uses
        the native <code>change</code> event — fires on blur / commit. Use{' '}
        <code>onInput</code> explicitly if you want keystroke-level updates.
      </p>
      <div class="row">
        <input
          type="text"
          placeholder="type then blur"
          value={native}
          onChange={(e) => setNative((e.target as HTMLInputElement).value)}
        />
        <span class="muted">
          onChange → <code>{JSON.stringify(native)}</code>
        </span>
      </div>
      <div class="row">
        <input
          type="text"
          placeholder="type to update live"
          value={oninput}
          onInput={(e) => setOnInput((e.target as HTMLInputElement).value)}
        />
        <span class="muted">
          onInput → <code>{JSON.stringify(oninput)}</code>
        </span>
      </div>
    </div>
  )
}

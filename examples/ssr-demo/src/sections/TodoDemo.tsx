import * as React from 'react'

interface Todo {
  id: number
  text: string
}

let nextId = 4

export function TodoDemo() {
  const [items, setItems] = React.useState<Todo[]>([
    { id: 1, text: 'Ship the shim' },
    { id: 2, text: 'Convince tanstack.com to try it' },
    { id: 3, text: 'Stop writing framework code at night' },
  ])
  const [draft, setDraft] = React.useState('')

  const add = () => {
    if (!draft.trim()) return
    setItems((xs) => [...xs, { id: nextId++, text: draft.trim() }])
    setDraft('')
  }
  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id))
  const move = (id: number, dir: -1 | 1) => {
    setItems((xs) => {
      const i = xs.findIndex((x) => x.id === id)
      if (i < 0) return xs
      const j = i + dir
      if (j < 0 || j >= xs.length) return xs
      const next = xs.slice()
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  return (
    <div class="stack">
      <p class="muted">
        Exercises the key-based reorder path in the reconciler. Move items up or
        down — DOM nodes are reused, not recreated.
      </p>
      <div class="row">
        <input
          type="text"
          placeholder="Add an item..."
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === 'Enter') add()
          }}
        />
        <button onClick={add}>add</button>
      </div>
      <ul class="todo">
        {items.map((t) => (
          <li key={t.id}>
            <span class="handle">≡</span>
            <span style="flex: 1">{t.text}</span>
            <button class="ghost" onClick={() => move(t.id, -1)}>
              ↑
            </button>
            <button class="ghost" onClick={() => move(t.id, 1)}>
              ↓
            </button>
            <button class="ghost" onClick={() => remove(t.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

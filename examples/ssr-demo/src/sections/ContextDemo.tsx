import * as React from 'react'

const ThemeCtx = React.createContext<'dark' | 'light'>('dark')
const UserCtx = React.createContext<{ name: string }>({ name: 'anonymous' })

function Leaf() {
  const theme = React.useContext(ThemeCtx)
  const user = React.useContext(UserCtx)
  return (
    <span class="pill">
      theme: <strong>{theme}</strong> · user: <strong>{user.name}</strong>
    </span>
  )
}

function Nested() {
  return (
    <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #2b313a' }}>
      <Leaf />
      <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #2b313a' }}>
        <Leaf />
      </div>
    </div>
  )
}

export function ContextDemo() {
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark')
  const [name, setName] = React.useState('Tanner')

  return (
    <div class="stack">
      <p class="muted">
        Provider values flow through nested function components and re-render
        consumers correctly on update.
      </p>
      <div class="row">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          toggle theme
        </button>
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </div>
      <ThemeCtx.Provider value={theme}>
        <UserCtx.Provider value={{ name }}>
          <Nested />
        </UserCtx.Provider>
      </ThemeCtx.Provider>
    </div>
  )
}

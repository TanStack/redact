import { createContext, useContext } from 'react'

const Theme = createContext('light')

// OK: reading the default value works without the feature.
function ThemeName() {
  return <code>{useContext(Theme)}</code>
}

export function ContextDemo() {
  return (
    <ul>
      <li>
        {/* Error: providers can't pass values down without `features.context`. */}
        {'<Theme value="dark">'} renders <Theme value="dark"><ThemeName /></Theme>
      </li>
      <li>
        {/* Error: the same applies to the Provider component. */}
        {'<Theme.Provider value="dark">'} renders <Theme.Provider value="dark"><ThemeName /></Theme.Provider>
      </li>
    </ul>
  )
}

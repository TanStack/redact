/**
 * Port of React's `ReactDOMServerIntegrationNewContext-test.js`. Covers
 * `createContext`, Provider/Consumer, default value, nested overrides,
 * and context unwinding after children exit a Provider.
 *
 * Skipped from upstream:
 *   - `readContext()` internal-dispatcher API test (uses
 *     `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` —
 *     an internal hook not part of the public surface).
 *   - The post-error context-pollution test: depends on throwing-during-
 *     render + re-render with clean context. Our SSR doesn't implement the
 *     error-recovery slot needed to assert this cleanly.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / context', () => {
  let Context: React.Context<string>
  let PurpleProvider: React.FC<{ children: React.ReactNode }>
  let RedProvider: React.FC<{ children: React.ReactNode }>
  let Consumer: React.Context<string>['Consumer']

  // React's harness re-creates these per test via beforeEach → `resetModules`.
  // We don't reset modules in vitest but the semantic is the same — each
  // test closes over fresh Provider/Consumer references.
  beforeEach(() => {
    Context = React.createContext('none')
    Consumer = Context.Consumer
    PurpleProvider = ({ children }) => (
      <Context.Provider value="purple">{children}</Context.Provider>
    )
    RedProvider = ({ children }) => (
      <Context.Provider value="red">{children}</Context.Provider>
    )
  })

  itRenders('class child with context', async (render) => {
    class ClassChild extends React.Component {
      render() {
        return (
          <div>
            <Consumer>{(text) => text}</Consumer>
          </div>
        )
      }
    }
    const e = (await render(
      <PurpleProvider>
        <ClassChild />
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('purple')
  })

  itRenders('function child with context', async (render) => {
    function FnChild() {
      return <Consumer>{(text) => text}</Consumer>
    }
    const e = (await render(
      <PurpleProvider>
        <FnChild />
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('purple')
  })

  itRenders('class child with default context', async (render) => {
    class ClassChild extends React.Component {
      render() {
        return (
          <div>
            <Consumer>{(text) => text}</Consumer>
          </div>
        )
      }
    }
    const e = (await render(<ClassChild />)) as HTMLElement
    expect(e.textContent).toBe('none')
  })

  itRenders('function child with default context', async (render) => {
    function FnChild() {
      return (
        <div>
          <Consumer>{(text) => text}</Consumer>
        </div>
      )
    }
    const e = (await render(<FnChild />)) as HTMLElement
    expect(e.textContent).toBe('none')
  })

  itRenders('context passed through to a grandchild', async (render) => {
    function Grandchild() {
      return (
        <div>
          <Consumer>{(text) => text}</Consumer>
        </div>
      )
    }
    const Child = () => <Grandchild />
    const e = (await render(
      <PurpleProvider>
        <Child />
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('purple')
  })

  itRenders('child context overriding parent context', async (render) => {
    const Grandchild = () => (
      <div>
        <Consumer>{(text) => text}</Consumer>
      </div>
    )
    const e = (await render(
      <PurpleProvider>
        <RedProvider>
          <Grandchild />
        </RedProvider>
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('red')
  })

  itRenders('useContext in different component shapes', async (render) => {
    const readCtx = () => React.useContext(Context)
    function Fn() {
      return readCtx() as any
    }
    const Memo = React.memo(() => readCtx() as any)
    const FwdRef = React.forwardRef((_props: any, _ref: any) => readCtx() as any)
    const e = (await render(
      <PurpleProvider>
        <RedProvider>
          <span>
            <Fn />
            <Memo />
            <FwdRef />
            <Consumer>{(t) => t}</Consumer>
          </span>
        </RedProvider>
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('redredredred')
  })

  itRenders('multiple independent contexts', async (render) => {
    const Theme = React.createContext('dark')
    const Language = React.createContext('french')
    class Parent extends React.Component {
      render() {
        return (
          <Theme.Provider value="light">
            <Child />
          </Theme.Provider>
        )
      }
    }
    function Child() {
      return (
        <Language.Provider value="english">
          <Grandchild />
        </Language.Provider>
      )
    }
    const Grandchild = () => (
      <div>
        <Theme.Consumer>
          {(theme) => <div id="theme">{theme}</div>}
        </Theme.Consumer>
        <Language.Consumer>
          {(lang) => <div id="language">{lang}</div>}
        </Language.Consumer>
      </div>
    )
    const e = (await render(<Parent />)) as HTMLElement
    expect(e.querySelector('#theme')!.textContent).toBe('light')
    expect(e.querySelector('#language')!.textContent).toBe('english')
  })

  itRenders('nested context unwinding', async (render) => {
    const Theme = React.createContext('dark')
    const Language = React.createContext('french')
    const App = () => (
      <div>
        <Theme.Provider value="light">
          <Language.Provider value="english">
            <Theme.Provider value="dark">
              <Theme.Consumer>
                {(theme) => <div id="theme1">{theme}</div>}
              </Theme.Consumer>
            </Theme.Provider>
            <Theme.Consumer>
              {(theme) => <div id="theme2">{theme}</div>}
            </Theme.Consumer>
            <Language.Provider value="sanskrit">
              <Theme.Provider value="blue">
                <Theme.Provider value="red">
                  <Language.Consumer>
                    {() => (
                      <Language.Provider value="chinese">
                        <Language.Consumer>
                          {(language) => <div id="language1">{language}</div>}
                        </Language.Consumer>
                      </Language.Provider>
                    )}
                  </Language.Consumer>
                </Theme.Provider>
                <Language.Consumer>
                  {(language) => (
                    <>
                      <Theme.Consumer>
                        {(theme) => <div id="theme3">{theme}</div>}
                      </Theme.Consumer>
                      <div id="language2">{language}</div>
                    </>
                  )}
                </Language.Consumer>
              </Theme.Provider>
            </Language.Provider>
          </Language.Provider>
        </Theme.Provider>
        <Language.Consumer>
          {(language) => <div id="language3">{language}</div>}
        </Language.Consumer>
      </div>
    )
    const e = (await render(<App />)) as HTMLElement
    expect(e.querySelector('#theme1')!.textContent).toBe('dark')
    expect(e.querySelector('#theme2')!.textContent).toBe('light')
    expect(e.querySelector('#theme3')!.textContent).toBe('blue')
    expect(e.querySelector('#language1')!.textContent).toBe('chinese')
    expect(e.querySelector('#language2')!.textContent).toBe('sanskrit')
    expect(e.querySelector('#language3')!.textContent).toBe('french')
  })
})

// Re-import beforeEach for clarity above.
import { beforeEach } from 'vitest'

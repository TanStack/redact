/**
 * Port of React's `ReactDOMServerIntegrationClassContextType-test.js`.
 * Verifies `static contextType = Ctx` on class components plumbs the
 * current Provider value into `this.context` during render.
 */
import { describe, beforeEach, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / class contextType', () => {
  let Context: React.Context<string>
  let PurpleProvider: React.FC<{ children: React.ReactNode }>
  let RedProvider: React.FC<{ children: React.ReactNode }>

  beforeEach(() => {
    Context = React.createContext('none')
    PurpleProvider = ({ children }) => (
      <Context.Provider value="purple">{children}</Context.Provider>
    )
    RedProvider = ({ children }) => (
      <Context.Provider value="red">{children}</Context.Provider>
    )
  })

  itRenders('class child with contextType', async (render) => {
    class ClassChild extends React.Component {
      static contextType = Context
      render() {
        return <div>{this.context as string}</div>
      }
    }
    const e = (await render(
      <PurpleProvider>
        <ClassChild />
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('purple')
  })

  itRenders('class child without contextType', async (render) => {
    class ClassChild extends React.Component {
      render() {
        return (
          <div>
            {typeof this.context === 'string' ? (this.context as string) : ''}
          </div>
        )
      }
    }
    const e = (await render(
      <PurpleProvider>
        <ClassChild />
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('')
  })

  itRenders('context passed through to a grandchild', async (render) => {
    class Grandchild extends React.Component {
      static contextType = Context
      render() {
        return <div>{this.context as string}</div>
      }
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
    class Grandchild extends React.Component {
      static contextType = Context
      render() {
        return <div>{this.context as string}</div>
      }
    }
    const e = (await render(
      <PurpleProvider>
        <RedProvider>
          <Grandchild />
        </RedProvider>
      </PurpleProvider>,
    )) as HTMLElement
    expect(e.textContent).toBe('red')
  })

  itRenders('multiple contexts via contextType', async (render) => {
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
    class ThemeComponent extends React.Component {
      static contextType = Theme
      render() {
        return <div id="theme">{this.context as string}</div>
      }
    }
    class LanguageComponent extends React.Component {
      static contextType = Language
      render() {
        return <div id="language">{this.context as string}</div>
      }
    }
    const Grandchild = () => (
      <div>
        <ThemeComponent />
        <LanguageComponent />
      </div>
    )
    const e = (await render(<Parent />)) as HTMLElement
    expect(e.querySelector('#theme')!.textContent).toBe('light')
    expect(e.querySelector('#language')!.textContent).toBe('english')
  })
})

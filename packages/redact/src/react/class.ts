import type { ReactNode } from '../core'

type SetStateCallback<S, P> = Partial<S> | ((prev: S, props: P) => Partial<S> | null) | null

export interface Component<P = {}, S = {}> {
  props: P
  state: S
  context: any
  refs: Record<string, any>
  _f: any
  _q: ((updater: SetStateCallback<S, P>, cb?: () => void) => void) | null
  _u: ((cb?: () => void) => void) | null
  setState(updater: SetStateCallback<S, P>, callback?: () => void): void
  forceUpdate(callback?: () => void): void
  render(): ReactNode
  componentDidMount?(): void
  componentDidUpdate?(prevProps: P, prevState: S, snapshot?: any): void
  componentWillUnmount?(): void
  shouldComponentUpdate?(nextProps: P, nextState: S, nextCtx: any): boolean
  getSnapshotBeforeUpdate?(prevProps: P, prevState: S): any
  componentDidCatch?(error: any, info: { componentStack: string }): void
}
export interface ComponentConstructor {
  new <P = {}, S = {}>(props: P, context?: any): Component<P, S>
  prototype: Component<any, any>
  contextType?: any
  getDerivedStateFromProps?(props: any, state: any): any
  getDerivedStateFromError?(error: any): any
  defaultProps?: any
  displayName?: string
}

// A real function constructor also supports the Component.call/apply pattern
// emitted by ES5 class transforms. The signature keeps generic class consumers.
export const Component = function Component(this: Component<any, any>, props: any, context?: any) {
  this.props = props
  this.context = context
  this.state = {}
  this.refs = {}
  this._f = this._q = this._u = null
} as unknown as ComponentConstructor
Object.assign(Component.prototype, {
  setState(this: Component<any, any>, updater: SetStateCallback<any, any>, callback?: () => void): void {
    if (!this._q) {
      if (process.env.NODE_ENV !== 'production') throw new Error('Cannot call setState on an um component.')
      throw new Error()
    }
    this._q(updater, callback)
  },
  forceUpdate(this: Component<any, any>, callback?: () => void): void {
    if (!this._u) return
    this._u(callback)
  },
  render(): ReactNode {
    if (process.env.NODE_ENV !== 'production') throw new Error('Component subclass must implement render().')
    throw new Error()
  },
  isReactComponent: {},
})
export interface PureComponent<P = {}, S = {}> extends Component<P, S> {}
export const PureComponent = function PureComponent(this: Component<any, any>, props: any, context?: any) {
  Component.call(this, props, context)
} as unknown as ComponentConstructor
PureComponent.prototype = Object.create(Component.prototype)
PureComponent.prototype.constructor = PureComponent
;(PureComponent.prototype as any).isPureReactComponent = true

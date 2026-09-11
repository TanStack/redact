import type { ReactNode } from '../core'

export const REACT_ACTIVITY_TYPE = Symbol.for('react.activity')

export interface ActivityProps {
  children?: ReactNode
  mode?: 'hidden' | 'visible'
}

export const Activity = REACT_ACTIVITY_TYPE as any as (props: ActivityProps) => any

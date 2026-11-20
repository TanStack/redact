import type { ChangeEvent, SyntheticEvent } from 'react'

export function changeEventTypes(event: ChangeEvent<HTMLInputElement>) {
  const value: string = event.target.value
  const checked: boolean = event.currentTarget.checked
  const native: Event = event.nativeEvent
  const generic: SyntheticEvent<HTMLInputElement> = event
  const stopped: boolean = event.isPropagationStopped()
  event.preventDefault()
  event.persist()
  // @ts-expect-error HTML input values are strings.
  const invalid: number = event.target.value
  // @ts-expect-error An input target does not have select options.
  event.target.options
  return {value, checked, native, generic, stopped, invalid}
}

export const selectChange = (event: ChangeEvent<HTMLSelectElement>) => {
  const options: HTMLOptionsCollection = event.target.options
  return void options
}

import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

async function checkControlledUpdate(
  html: string,
  render: () => React.ReactNode,
  edit: (container: HTMLDivElement) => void,
  checkHydrated: (container: HTMLDivElement) => void,
  checkUpdated: (container: HTMLDivElement) => void,
) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  edit(container)
  const original = container.firstChild
  const errors: unknown[] = []
  let mounted!: () => void
  const ready = new Promise<void>((resolve) => { mounted = resolve })
  function App() {
    React.useLayoutEffect(mounted, [])
    return render()
  }
  const root = hydrateRoot(container, <App />, {
    onRecoverableError: (error) => errors.push(error),
  })
  try {
    await ready
    expect(container.firstChild).toBe(original)
    expect(errors).toEqual([])
    checkHydrated(container)
    flushSync(() => root.render(<App />))
    expect(container.firstChild).toBe(original)
    checkUpdated(container)
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
}

it('restores unchanged controlled checked state on the first update after hydration', async () => {
  await checkControlledUpdate(
    '<input type="checkbox" checked>',
    () => <input type="checkbox" checked={false} onChange={() => {}} />,
    () => {},
    (container) => {
      const input = container.firstChild as HTMLInputElement
      expect(input.checked).toBe(true)
      expect(input.defaultChecked).toBe(false)
    },
    (container) => {
      expect((container.firstChild as HTMLInputElement).checked).toBe(false)
    },
  )
})

it('restores unchanged controlled textarea value on the first update after hydration', async () => {
  await checkControlledUpdate(
    '<textarea>server</textarea>',
    () => <textarea value="" onChange={() => {}} />,
    (container) => { (container.firstChild as HTMLTextAreaElement).value = 'edited' },
    (container) => {
      const textarea = container.firstChild as HTMLTextAreaElement
      expect(textarea.value).toBe('edited')
      expect(textarea.defaultValue).toBe('')
    },
    (container) => {
      expect((container.firstChild as HTMLTextAreaElement).value).toBe('')
    },
  )
})

for (const hydration of [false, true]) {
  const mode = hydration ? 'hydration' : 'mount'
  async function withControl(
    html: string,
    initial: React.ReactNode,
    check: (container: HTMLDivElement, render: (node: React.ReactNode) => void) => void,
  ) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let ready!: () => void
    const mounted = new Promise<void>((resolve) => { ready = resolve })
    function App({ children }: { children: React.ReactNode }) {
      React.useLayoutEffect(ready, [])
      return <form>{children}</form>
    }
    const errors: unknown[] = []
    if (hydration) container.innerHTML = `<form>${html}</form>`
    const root = hydration
      ? hydrateRoot(container, <App>{initial}</App>, { onRecoverableError: error => errors.push(error) })
      : createRoot(container)
    if (!hydration) flushSync(() => root.render(<App>{initial}</App>))
    try {
      await mounted
      expect(errors).toEqual([])
      check(container, node => flushSync(() => root.render(<App>{node}</App>)))
    } finally {
      flushSync(() => root.unmount())
      container.remove()
    }
  }

  it(`${mode}: restores controlled checked state even when props are unchanged`, async () => {
    const view = () => <input type="checkbox" checked onChange={() => {}} />
    await withControl('<input type="checkbox" checked>', view(), (container, render) => {
      const input = container.querySelector('input')!
      input.checked = false
      render(view())
      expect(input.checked).toBe(true)
      expect(input.defaultChecked).toBe(true)
      expect(container.querySelector('input')).toBe(input)
    })
  })

  it(`${mode}: controlled checked updates keep the original reset default`, async () => {
    await withControl('<input type="checkbox" checked>', <input type="checkbox" checked onChange={() => {}} />, (container, render) => {
      const input = container.querySelector('input')!
      render(<input type="checkbox" checked={false} onChange={() => {}} />)
      expect(input.checked).toBe(false)
      expect(input.defaultChecked).toBe(true)
      container.querySelector('form')!.reset()
      expect(input.checked).toBe(true)
      render(<input type="checkbox" checked={false} onChange={() => {}} />)
      expect(input.checked).toBe(false)
    })
  })

  it(`${mode}: uncontrolled defaultChecked updates reset state without changing live state`, async () => {
    await withControl('<input type="checkbox">', <input type="checkbox" defaultChecked={false} />, (container, render) => {
      const input = container.querySelector('input')!
      render(<input type="checkbox" defaultChecked />)
      expect(input.checked).toBe(false)
      expect(input.defaultChecked).toBe(true)
      container.querySelector('form')!.reset()
      expect(input.checked).toBe(true)
      render(<input type="checkbox" defaultChecked={false} />)
      expect(input.defaultChecked).toBe(false)
      render(<input type="checkbox" />)
      expect(input.defaultChecked).toBe(false)
    })
  })

  it(`${mode}: removing defaultChecked keeps the last reset default`, async () => {
    await withControl('<input type="checkbox" checked>', <input type="checkbox" defaultChecked />, (container, render) => {
      const input = container.querySelector('input')!
      input.checked = false
      render(<input type="checkbox" />)
      expect(input.checked).toBe(false)
      expect(input.defaultChecked).toBe(true)
      container.querySelector('form')!.reset()
      expect(input.checked).toBe(true)
    })
  })

  it(`${mode}: checked control transitions preserve the live state and update reset defaults`, async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await withControl('<input type="checkbox" checked>', <input type="checkbox" checked onChange={() => {}} />, (container, render) => {
        const input = container.querySelector('input')!
        render(<input type="checkbox" defaultChecked={false} />)
        expect(input.checked).toBe(true)
        expect(input.defaultChecked).toBe(false)
        render(<input type="checkbox" checked={false} onChange={() => {}} />)
        expect(input.checked).toBe(false)
        expect(input.defaultChecked).toBe(false)
      })
    } finally {
      warning.mockRestore()
    }
  })

  it(`${mode}: controlled radio group restores external edits and switches selection`, async () => {
    const view = (selected: string) => <><input type="radio" name="choice" value="a" checked={selected === 'a'} onChange={() => {}} /><input type="radio" name="choice" value="b" checked={selected === 'b'} onChange={() => {}} /></>
    await withControl('<input type="radio" name="choice" value="a" checked><input type="radio" name="choice" value="b">', view('a'), (container, render) => {
      const [a, b] = Array.from(container.querySelectorAll('input'))
      b!.checked = true
      render(view('a'))
      expect([a!.checked, b!.checked]).toEqual([true, false])
      render(view('b'))
      expect([a!.checked, b!.checked]).toEqual([false, true])
    })
  })

  it(`${mode}: moving a radio between groups does not uncheck an unmanaged selected radio`, async () => {
    const external = document.createElement('input')
    external.type = 'radio'
    external.name = 'target'
    document.body.appendChild(external)
    try {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const view = (name: string, checked: boolean) => <input type="radio" name={name} checked={checked} onChange={() => {}} />
      if (hydration) container.innerHTML = '<input type="radio" name="source" checked>'
      let ready!: () => void
      const mounted = new Promise<void>(resolve => { ready = resolve })
      function App({ name, checked }: { name: string; checked: boolean }) {
        React.useLayoutEffect(ready, [])
        return view(name, checked)
      }
      const root = hydration ? hydrateRoot(container, <App name="source" checked />) : createRoot(container)
      if (!hydration) flushSync(() => root.render(<App name="source" checked />))
      try {
        await mounted
        external.checked = true
        flushSync(() => root.render(<App name="target" checked={false} />))
        expect((container.firstChild as HTMLInputElement).checked).toBe(false)
        expect(external.checked).toBe(true)
      } finally {
        flushSync(() => root.unmount())
        container.remove()
      }
    } finally {
      external.remove()
    }
  })

  it(`${mode}: removing a radio name removes its group attribute`, async () => {
    await withControl('<input type="radio" name="choice" checked>', <input type="radio" name="choice" checked onChange={() => {}} />, (container, render) => {
      const input = container.querySelector('input')!
      render(<input type="radio" checked onChange={() => {}} />)
      expect(input.hasAttribute('name')).toBe(false)
      expect(input.name).toBe('')
      expect(input.checked).toBe(true)
    })
  })

  it(`${mode}: textarea restores unchanged controlled value and updates reset defaults`, async () => {
    const view = (value = 'initial') => <textarea value={value} onChange={() => {}} />
    await withControl('<textarea>initial</textarea>', view(), (container, render) => {
      const textarea = container.querySelector('textarea')!
      expect(textarea.defaultValue).toBe('initial')
      textarea.value = 'edited'
      render(view())
      expect(textarea.value).toBe('initial')
      render(view('next'))
      expect(textarea.defaultValue).toBe('next')
      textarea.value = 'another edit'
      container.querySelector('form')!.reset()
      expect(textarea.value).toBe('next')
      expect(container.querySelector('textarea')).toBe(textarea)
    })
  })

  it(`${mode}: textarea does not rewrite an unchanged focused value`, async () => {
    const view = () => <textarea value="selection" onChange={() => {}} />
    await withControl('<textarea>selection</textarea>', view(), (container, render) => {
      const textarea = container.querySelector('textarea')!
      textarea.focus()
      textarea.setSelectionRange(2, 5, 'backward')
      render(view())
      expect(document.activeElement).toBe(textarea)
      expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection]).toEqual([2, 5, 'backward'])
    })
  })

  it(`${mode}: uncontrolled textarea default updates preserve edits and reset correctly`, async () => {
    await withControl('<textarea>initial</textarea>', <textarea defaultValue="initial" />, (container, render) => {
      const textarea = container.querySelector('textarea')!
      textarea.value = 'edited'
      render(<textarea defaultValue="next" />)
      expect(textarea.value).toBe('edited')
      expect(textarea.defaultValue).toBe('next')
      container.querySelector('form')!.reset()
      expect(textarea.value).toBe('next')
      textarea.value = 'edited again'
      render(<textarea />)
      expect(textarea.value).toBe('edited again')
      expect(textarea.defaultValue).toBe('')
      container.querySelector('form')!.reset()
      expect(textarea.value).toBe('')
    })
  })

  it(`${mode}: uncontrolled textarea default updates preserve an unedited initial value`, async () => {
    await withControl('<textarea>initial</textarea>', <textarea defaultValue="initial" />, (container, render) => {
      const textarea = container.querySelector('textarea')!
      render(<textarea defaultValue="next" />)
      expect(textarea.value).toBe('initial')
      expect(textarea.defaultValue).toBe('next')
    })
  })

  it(`${mode}: reusing the same control element skips controlled restoration`, async () => {
    const child = <><input type="checkbox" checked onChange={() => {}} /><textarea value="initial" onChange={() => {}} /></>
    await withControl('<input type="checkbox" checked><textarea>initial</textarea>', child, (container, render) => {
      const input = container.querySelector('input')!
      const textarea = container.querySelector('textarea')!
      input.checked = false
      textarea.value = 'edited'
      render(child)
      expect(input.checked).toBe(false)
      expect(textarea.value).toBe('edited')
    })
  })

  it(`${mode}: textarea accepts numeric zero without treating it as empty`, async () => {
    await withControl('<textarea>0</textarea>', <textarea value={0} onChange={() => {}} />, (container, render) => {
      const textarea = container.querySelector('textarea')!
      textarea.value = 'edited'
      render(<textarea value={0} onChange={() => {}} />)
      expect(textarea.value).toBe('0')
      expect(textarea.defaultValue).toBe('0')
    })
  })

  it(`${mode}: textarea control transitions keep displayed text until controlled again`, async () => {
    await withControl('<textarea>initial</textarea>', <textarea value="initial" onChange={() => {}} />, (container, render) => {
      const textarea = container.querySelector('textarea')!
      render(<textarea defaultValue="fallback" />)
      expect(textarea.value).toBe('initial')
      expect(textarea.defaultValue).toBe('fallback')
      render(<textarea value="controlled again" onChange={() => {}} />)
      expect(textarea.value).toBe('controlled again')
      expect(textarea.defaultValue).toBe('controlled again')
    })
  })

  it(`${mode}: controlled textarea prefers value on mount and an explicit reset default on update`, async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const view = () => <textarea defaultValue="reset" value="controlled" onChange={() => {}} />
      await withControl('<textarea>controlled</textarea>', view(), (container, render) => {
        const textarea = container.querySelector('textarea')!
        expect(textarea.value).toBe('controlled')
        expect(textarea.defaultValue).toBe('controlled')
        render(view())
        expect(textarea.value).toBe('controlled')
        expect(textarea.defaultValue).toBe('reset')
        container.querySelector('form')!.reset()
        expect(textarea.value).toBe('reset')
        render(view())
        expect(textarea.value).toBe('controlled')
      })
    } finally {
      warning.mockRestore()
    }
  })

  for (const children of ['initial', ['initial']]) {
    it(`${mode}: legacy textarea ${Array.isArray(children) ? 'array' : 'string'} children initialize live state without retaining a text fiber`, async () => {
      const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await withControl('<textarea>initial</textarea>', <textarea>{children}</textarea>, (container, render) => {
          const textarea = container.querySelector('textarea')!
          expect(textarea.value).toBe('initial')
          render(<textarea>changed children</textarea>)
          expect(textarea.value).toBe('initial')
          expect(textarea.defaultValue).toBe('')
          render(<textarea defaultValue="reset" />)
          expect(textarea.value).toBe('initial')
          expect(textarea.defaultValue).toBe('reset')
          container.querySelector('form')!.reset()
          expect(textarea.value).toBe('reset')
        })
      } finally {
        warning.mockRestore()
      }
    })
  }

  it(`${mode}: textarea ref cleanup observes its owned text and live value before removal`, async () => {
    const observations: unknown[] = []
    const ref = (node: HTMLTextAreaElement | null) => {
      if (node) return () => {
        observations.push([node.value, node.defaultValue, node.textContent, node.isConnected])
      }
    }
    await withControl('<textarea>initial</textarea>', <textarea ref={ref} defaultValue="initial" />, (container, render) => {
      const textarea = container.querySelector('textarea')!
      textarea.value = 'edited'
      render(<textarea ref={ref} defaultValue="next" />)
      expect(textarea.textContent).toBe('next')
      expect(observations).toEqual([])
    })
    expect(observations).toEqual([['edited', 'next', 'next', true]])
  })

  for (const initial of [0, 42, '', ['array default']]) {
    it(`${mode}: uncontrolled textarea default ${JSON.stringify(initial)} keeps React's initial dirty state`, async () => {
      await withControl(`<textarea>${initial}</textarea>`, <textarea defaultValue={initial} />, (container, render) => {
        const textarea = container.querySelector('textarea')!
        expect(textarea.value).toBe('' + initial)
        render(<textarea defaultValue="next" />)
        expect(textarea.value).toBe('next')
        expect(textarea.defaultValue).toBe('next')
        textarea.value = 'edited'
        render(<textarea defaultValue="last" />)
        expect(textarea.value).toBe('edited')
        container.querySelector('form')!.reset()
        expect(textarea.value).toBe('last')
      })
    })
  }

  for (const children of [0, false, null, '']) {
    it(`${mode}: legacy textarea child ${JSON.stringify(children)} keeps React's initial dirty state`, async () => {
      const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
      const initial = children == null ? '' : '' + children
      try {
        await withControl(`<textarea>${initial}</textarea>`, <textarea>{children}</textarea>, (container, render) => {
          const textarea = container.querySelector('textarea')!
          expect(textarea.value).toBe(initial)
          render(<textarea defaultValue="next" />)
          expect(textarea.value).toBe('next')
          expect(textarea.defaultValue).toBe('next')
        })
      } finally {
        warning.mockRestore()
      }
    })
  }
}

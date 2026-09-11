import { expect, it } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

async function hydrateControl(
  html: string,
  element: React.ReactNode,
  edit: (container: HTMLDivElement) => void,
  check: (container: HTMLDivElement, update: (element: React.ReactNode) => void) => void,
  parent: HTMLElement = document.body,
) {
  const container = document.createElement('div')
  container.innerHTML = html
  parent.appendChild(container)
  edit(container)
  const nodes = [...container.querySelectorAll('*')]
  const errors: unknown[] = []
  let mounted!: () => void
  const ready = new Promise<void>((resolve) => { mounted = resolve })
  function App({ children }: { children: React.ReactNode }) {
    React.useLayoutEffect(mounted, [])
    return children
  }
  const root = hydrateRoot(container, <App>{element}</App>, {
    onRecoverableError: (error) => errors.push(error),
  })
  try {
    await ready
    const hydrated = [...container.querySelectorAll('*')]
    expect(hydrated).toHaveLength(nodes.length)
    nodes.forEach((node, index) => expect(hydrated[index]).toBe(node))
    expect(errors).toEqual([])
    check(container, (next) => flushSync(() => root.render(<App>{next}</App>)))
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
}

for (const type of ['text', 'number']) {
  for (const controlled of [false, true]) {
    for (const edited of [false, true]) {
      it(`hydrates ${edited ? 'edited' : 'clean'} ${controlled ? 'controlled' : 'uncontrolled'} ${type} input with a different client default`, async () => {
        const props = controlled ? { value: '3.00', onChange() {} } : { defaultValue: '3.00' }
        await hydrateControl(`<form><input type="${type}" value="1.00"></form>`,
          <form><input type={type} {...props} /></form>,
          (container) => {
            if (edited) container.querySelector('input')!.value = '2.00'
          },
          (container, update) => {
            const input = container.querySelector('input')!
            expect(input.value).toBe(edited ? '2.00' : '3.00')
            expect(input.defaultValue).toBe('3.00')
            if (controlled) {
              update(<form><input type={type} {...props} /></form>)
              expect(input.value).toBe('3.00')
            }
            container.querySelector('form')!.reset()
            expect(input.value).toBe('3.00')
          })
      })
    }
  }
}

it('preserves number input spelling edited before hydration with matching server props', async () => {
  await hydrateControl('<input type="number" value="1.00">',
    <input type="number" value="1.00" onChange={() => {}} />,
    (container) => { (container.firstChild as HTMLInputElement).value = '2.00' },
    (container) => {
      const input = container.firstChild as HTMLInputElement
      expect(input.value).toBe('2.00')
      expect(input.defaultValue).toBe('1.00')
    })
})

for (const controlled of [false, true]) {
  for (const edited of [false, true]) {
    it(`hydrates ${edited ? 'edited' : 'clean'} ${controlled ? 'controlled' : 'uncontrolled'} checked state without changing live state`, async () => {
      const props = controlled ? { checked: false, onChange() {} } : { defaultChecked: false }
      await hydrateControl('<form><input type="checkbox" checked></form>',
        <form><input type="checkbox" {...props} /></form>,
        (container) => { if (edited) container.querySelector('input')!.checked = false },
        (container) => {
          const input = container.querySelector('input')!
          expect(input.checked).toBe(!edited)
          expect(input.defaultChecked).toBe(false)
          container.querySelector('form')!.reset()
          expect(input.checked).toBe(false)
        })
    })
  }
}

it('preserves live form state inside a programmatically created head descendant', async () => {
  await hydrateControl('<input type="text" value="server">',
    <input type="text" value="client" onChange={() => {}} />,
    (container) => { (container.firstChild as HTMLInputElement).value = 'edited' },
    (container) => {
      const input = container.firstChild as HTMLInputElement
      expect(input.value).toBe('edited')
      expect(input.defaultValue).toBe('client')
    }, document.head)
})

it('preserves live option selection when the selected prop describes the server default', async () => {
  await hydrateControl('<select><option value="a" selected>A</option><option value="b">B</option></select>',
    <select><option value="a" selected>A</option><option value="b">B</option></select>,
    (container) => { (container.firstChild as HTMLSelectElement).value = 'b' },
    (container) => {
      const select = container.firstChild as HTMLSelectElement
      expect(select.value).toBe('b')
      expect(select.options[0]!.defaultSelected).toBe(true)
      expect(select.options[1]!.selected).toBe(true)
    })
})

for (const type of ['submit', 'reset']) {
  it(`keeps the native ${type} label when only defaultValue is passed during hydration`, async () => {
    await hydrateControl(`<input type="${type}">`,
      <input type={type} defaultValue="ignored" />,
      () => {},
      (container) => {
        const input = container.firstChild as HTMLInputElement
        expect(input.hasAttribute('value')).toBe(false)
        expect(input.value).toBe('')
        expect(input.defaultValue).toBe('')
      })
  })
}

for (const [serverType, clientType] of [['submit', 'text'], ['text', 'submit']]) {
  it(`initializes defaults after a suppressed ${serverType}-to-${clientType} input type mismatch`, async () => {
    await hydrateControl(`<input type="${serverType}">`,
      <input type={clientType} defaultValue="client" suppressHydrationWarning />,
      () => {},
      (container) => {
        const input = container.firstChild as HTMLInputElement
        expect(input.type).toBe(clientType)
        expect(input.defaultValue).toBe(clientType === 'submit' ? '' : 'client')
        expect(input.hasAttribute('value')).toBe(clientType !== 'submit')
      }, document.head)
  })
}

for (const children of ['server', ['server']]) {
  it(`hydrates edited textarea with legacy ${Array.isArray(children) ? 'array' : 'string'} children`, async () => {
    await hydrateControl('<textarea>server</textarea>',
      <textarea>{children}</textarea>,
      (container) => { (container.firstChild as HTMLTextAreaElement).value = 'edited' },
      (container) => {
        const textarea = container.firstChild as HTMLTextAreaElement
        expect(textarea.value).toBe('server')
        expect(textarea.defaultValue).toBe('server')
      })
  })
}

it('preserves an edited radio group while setting client reset defaults', async () => {
  await hydrateControl('<form><input type="radio" name="group" checked><input type="radio" name="group"></form>',
    <form><input type="radio" name="group" defaultChecked /><input type="radio" name="group" /></form>,
    (container) => { container.querySelectorAll('input')[1]!.checked = true },
    (container) => {
      const inputs = [...container.querySelectorAll('input')]
      expect(inputs.map((input) => input.checked)).toEqual([false, true])
      expect(inputs.map((input) => input.defaultChecked)).toEqual([true, false])
      container.querySelector('form')!.reset()
      expect(inputs.map((input) => input.checked)).toEqual([true, false])
    })
})

for (const multiple of [false, true]) {
  for (const controlled of [false, true]) {
    it(`preserves edited ${multiple ? 'multiple' : 'single'} ${controlled ? 'controlled' : 'uncontrolled'} select during hydration`, async () => {
      const value = multiple ? ['a'] : 'a'
      const props = controlled ? { value, onChange() {} } : { defaultValue: value }
      const element = <form><select multiple={multiple} {...props}><option value="a">A</option><option value="b">B</option></select></form>
      await hydrateControl(`<form><select${multiple ? ' multiple' : ''}><option value="a" selected>A</option><option value="b">B</option></select></form>`, element,
        (container) => { container.querySelector('select')!.value = 'b' },
        (container, update) => {
          const select = container.querySelector('select')!
          expect(select.value).toBe('b')
          if (controlled) {
            update(<form><select multiple={multiple} {...props}><option value="a">A</option><option value="b">B</option></select></form>)
            expect(select.value).toBe('a')
          }
          container.querySelector('form')!.reset()
          expect(select.value).toBe('a')
        })
    })
  }
}

for (const controlled of [false, true]) {
  for (const value of ['client', '', 3, 0]) {
    it(`matches React hydration for edited ${controlled ? 'controlled' : 'uncontrolled'} textarea with ${JSON.stringify(value)} client value`, async () => {
      const props = controlled ? { value, onChange() {} } : { defaultValue: value }
      await hydrateControl('<form><textarea>server</textarea></form>',
        <form><textarea {...props} /></form>,
        (container) => { container.querySelector('textarea')!.value = 'edited' },
        (container) => {
          const textarea = container.querySelector('textarea')!
          expect(textarea.value).toBe(typeof value === 'string' && value ? value : 'edited')
          expect(textarea.defaultValue).toBe(String(value))
          container.querySelector('form')!.reset()
          expect(textarea.value).toBe(String(value))
        })
    })
  }
}

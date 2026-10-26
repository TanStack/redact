import { Activity, useState } from 'react'

function Draft() {
  const [text, setText] = useState('')
  return <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type, hide, then show" />
}

export function ActivityDemo() {
  const [visible, setVisible] = useState(true)
  return (
    <>
      <button onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>{' '}
      {/* Error: without `features.activity`, hidden children unmount and lose state. */}
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <Draft />
      </Activity>
    </>
  )
}

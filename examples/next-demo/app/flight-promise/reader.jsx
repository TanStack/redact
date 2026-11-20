'use client'

import { use } from 'react'

export default function Reader({ value }) {
  return <p id="read">{use(value)}</p>
}

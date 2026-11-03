'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function OwnerStackPage() {
  const [count, setCount] = useState(0)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return <main>
    <h1>Owner stack link</h1>
    <Link href="/other" prefetch={true}>Open target</Link>
    <button data-ready={ready} onClick={() => setCount(count + 1)}>Count: {count}</button>
  </main>
}

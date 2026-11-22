import { Link, useLoaderData } from 'react-router'
export function loader() {
  return { label: 'Detail loader' }
}
export default function Detail() {
  const data = useLoaderData()
  return (
    <main>
      <h1>{data.label}</h1>
      <Link to="/">Home</Link>
      <div style={{ height: 2400 }} aria-hidden="true" />
    </main>
  )
}

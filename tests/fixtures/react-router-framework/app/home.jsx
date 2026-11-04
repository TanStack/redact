import { session, trace, clientSeed, clientStamp } from './contexts'
export const middleware = [
  async ({ context }, next) => {
    context.get(trace).push('child-before')
    const response = await next()
    context.get(trace).push('child-after')
    return response
  },
]
export const clientMiddleware = [
  async ({ context }, next) => {
    const seed = context.get(clientSeed)
    if (context.get(clientStamp) !== seed)
      throw Error('Client context identity split')
    window.middlewareEvents.push({ part: 'child-before', seed })
    await next()
    window.middlewareEvents.push({ part: 'child-after', seed })
  },
]
import {
  Link,
  Form,
  useLoaderData,
  useActionData,
  useFetcher,
  useNavigation,
  Await,
} from 'react-router'
import { Suspense, useId, useState } from 'react'
export function loader({ context }) {
  return {
    session: context.get(session),
    trace: context.get(trace).join('|'),
    label: 'Home loader',
    later: new Promise((resolve) =>
      setTimeout(() => resolve('Stream complete'), 200)
    ),
  }
}
export async function action({ request, context }) {
  const data = await request.formData()
  return { result: 'Saved ' + data.get('name'), session: context.get(session) }
}
export default function Home() {
  const data = useLoaderData(),
    action = useActionData(),
    fetcher = useFetcher(),
    navigation = useNavigation(),
    fieldId = useId(),
    [counter, setCounter] = useState(0)
  return (
    <main>
      <h1>{data.label}</h1>
      <h2 id="hmr-label">Before edit</h2>
      <button id="hmr-counter" onClick={() => setCounter(counter + 1)}>
        Local count {counter}
      </button>
      <p id="session">{data.session}</p>
      <p id="server-trace">{data.trace}</p>
      <p id="nav-state">{navigation.state}</p>
      <Link to="/">Cancel</Link>
      <Link to="/detail">Detail</Link>
      <Form method="post">
        <label htmlFor={fieldId}>Name</label>
        <input id={fieldId} name="name" defaultValue="Ada" />
        <button type="submit">Save</button>
      </Form>
      <p id="action">{action?.result}</p>
      <p id="action-session">{action?.session}</p>
      <fetcher.Form method="post">
        <input type="hidden" name="name" value="Grace" />
        <button type="submit">Fetch save</button>
      </fetcher.Form>
      <p id="fetcher">{fetcher.data?.result}</p>
      <p id="fetcher-session">{fetcher.data?.session}</p>
      <Suspense fallback={<p>Waiting</p>}>
        <Await resolve={data.later}>
          {(value) => <p id="stream">{value}</p>}
        </Await>
      </Suspense>
      <div style={{ height: 2400 }} aria-hidden="true" />
    </main>
  )
}

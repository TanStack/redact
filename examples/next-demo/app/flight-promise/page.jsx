import Counter from '../counter'
import Reader from './reader'

// A promise passed from a Server Component reaches the browser as a Flight chunk
export default function FlightPromise() {
  return <main><h1>Flight promise</h1><Reader value={Promise.resolve('Read from the server')} /><Counter /></main>
}

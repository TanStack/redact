/* @jsxImportSource custom-jsx */
/// <reference path="./jsx-runtime.d.ts" />
import './style.css'

function Button(props: { onClick?: () => void; children?: any }) {
  return (
    <button class="btn" onClick={props.onClick}>
      {props.children}
    </button>
  )
}

function App() {
  return (
    <div class="wrapper">
      <h1>Hello from custom JSX runtime</h1>
      <Button onClick={() => alert('hi')}>Click</Button>
    </div>
  )
}

const root = document.getElementById('app')!
root.appendChild(<App />)

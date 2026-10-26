import { createPortal } from 'react-dom'

export function PortalDemo() {
  return (
    <div className="outline">
      {/* Error: without `features.portal`, portal children render in place. */}
      {createPortal(<p>This should render in document.body.</p>, document.body)}
    </div>
  )
}

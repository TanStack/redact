import assert from 'node:assert/strict'

export async function reloadDocument(page, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout
  const remaining = () => Math.max(1, deadline - Date.now())
  const previous = await page.evaluate(() => performance.timeOrigin)
  const url = page.url()
  let response
  const received = value => {
    const request = value.request()
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) response = value
  }
  page.on('response', received)
  try {
    // Next's development socket may initiate a second reload while the first
    // document request is pending. Observe the browser's resulting document.
    let directResponse
    let interruption
    try {
      directResponse = await page.reload({ waitUntil: 'load', timeout: remaining() })
    } catch (error) {
      if (!/ERR_ABORTED|NS_BINDING_ABORTED|NS_ERROR_FAILURE|interrupted by another navigation|Frame load interrupted/.test(String(error))) throw error
      interruption = error
    }
    // The reload command returns its document response even if WebKit omits
    // the corresponding page response event. Interrupted reloads use the
    // resulting document observed above, without issuing another navigation.
    // Firefox can report NS_ERROR_FAILURE for the interrupted command. The
    // new time origin, matching URL, and successful response still must pass.
    response ||= directResponse
    try {
      await page.waitForFunction(previous => performance.timeOrigin !== previous, previous, { timeout: remaining() })
    } catch (error) {
      if (interruption && error.name === 'TimeoutError') throw interruption
      throw error
    }
    await page.waitForLoadState('load', { timeout: remaining() })
    assert.equal(page.url(), url, 'Reload must preserve the current URL')
    assert.ok(response && response.status() < 400, `Reload must receive a successful document response, received ${response?.status()}`)
  } finally { page.off('response', received) }
}

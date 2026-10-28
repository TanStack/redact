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
    try {
      directResponse = await page.reload({ waitUntil: 'load', timeout: remaining() })
    } catch (error) {
      if (!/ERR_ABORTED|NS_BINDING_ABORTED|interrupted by another navigation|Frame load interrupted/.test(String(error))) throw error
    }
    // The reload command returns its document response even if WebKit omits
    // the corresponding page response event. Interrupted reloads use the
    // resulting document observed above, without issuing another navigation.
    response ||= directResponse
    await page.waitForFunction(previous => performance.timeOrigin !== previous, previous, { timeout: remaining() })
    await page.waitForLoadState('load', { timeout: remaining() })
    assert.equal(page.url(), url, 'Reload must preserve the current URL')
    assert.ok(response && response.status() < 400, `Reload must receive a successful document response, received ${response?.status()}`)
  } finally { page.off('response', received) }
}

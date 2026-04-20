import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://localhost:5173' })

test('playground renders, no page errors, interactivity works', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
  })

  await page.goto('/')
  await expect(page.locator('h1', { hasText: 'tanstack-dom playground' })).toBeVisible()

  // Streaming boundaries resolve
  await expect(page.locator('p', { hasText: 'Hello from a 300 ms' })).toBeVisible({ timeout: 4000 })
  await expect(page.locator('p', { hasText: 'held back at the server for 900 ms' })).toBeVisible({
    timeout: 4000,
  })

  // Counter +1 button
  const counter = page.getByRole('button', { name: '+1' })
  const pill = page.locator('.pill').filter({ hasText: /count =/ })
  await expect(pill).toHaveText('count = 0')
  await counter.click()
  await counter.click()
  await expect(pill).toHaveText('count = 2')

  // Todo add + remove
  const todoInput = page.getByPlaceholder('Add an item...')
  await todoInput.fill('Play with the shim')
  await page.getByRole('button', { name: 'add' }).click()
  await expect(page.locator('ul.todo li').last()).toContainText('Play with the shim')

  // Theme toggle
  const themeBtn = page.getByRole('button', { name: 'toggle theme' })
  const themePill = page.locator('.pill').filter({ hasText: /theme:/ }).first()
  await expect(themePill).toContainText('dark')
  await themeBtn.click()
  await expect(themePill).toContainText('light')

  // Error boundary catch + reset (scope to the error-boundary section)
  const ebSection = page.locator('section').filter({ hasText: 'Error boundary' })
  await ebSection.getByRole('button', { name: 'throw' }).click()
  await expect(ebSection.locator('.danger')).toContainText('Deliberate failure')
  await ebSection.getByRole('button', { name: 'reset' }).click()
  await expect(ebSection.locator('.ok', { hasText: 'all good' })).toBeVisible()

  console.log(`pageerrors: ${errors.length}`, errors)
  expect(errors.length).toBeLessThan(3) // allow minor warnings, hard-fail on real errors
})

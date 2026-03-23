import { test, expect } from '@playwright/test'

/**
 * AI chat panel tests.
 *
 * The AI chat lives in two places:
 * 1. HomePage (/) — the main chat interface with ChatComposer + ChatHero
 * 2. EditorView (/editor) — AISidebar on the right panel
 *
 * Most of these tests target the HomePage chat since it's the primary
 * entry point. Tests that require a live API are skipped by default.
 */

const HAS_API = !!process.env.E2E_HAS_API

/** Helper: set demo mode and navigate to a route. */
async function gotoWithDemo(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)

  // If redirected to demo, set sessionStorage and retry
  if (page.url().includes('/demo')) {
    await page.evaluate(() => {
      sessionStorage.setItem('demoMode', 'true')
    })
    await page.goto(path)
  }

  return !page.url().includes('/demo')
}

test.describe('AI Chat — Home page', () => {
  test('home page shows the chat hero or composer', async ({ page }) => {
    const reached = await gotoWithDemo(page, '/')

    if (!reached) {
      test.skip(true, 'Could not access home page outside demo mode')
      return
    }

    // The app should show either the hero state or the chat composer
    const hero = page.locator('.chat-hero, [class*="hero"]')
    const composer = page.locator('.chat-composer, [class*="composer"]')

    // At least one should be visible (hero on empty state, composer always)
    const heroVisible = await hero.isVisible().catch(() => false)
    const composerVisible = await composer.isVisible().catch(() => false)

    expect(heroVisible || composerVisible).toBe(true)
  })

  test('chat composer has a text input area', async ({ page }) => {
    const reached = await gotoWithDemo(page, '/')

    if (!reached) {
      test.skip(true, 'Could not access home page')
      return
    }

    // Look for textarea or contenteditable input in the composer
    const input = page.locator(
      '.chat-composer textarea, .chat-composer [contenteditable], [class*="composer"] textarea, [class*="composer"] [contenteditable]'
    )
    await expect(input.first()).toBeVisible({ timeout: 10_000 })
  })

  test('can type in the chat input', async ({ page }) => {
    const reached = await gotoWithDemo(page, '/')

    if (!reached) {
      test.skip(true, 'Could not access home page')
      return
    }

    const input = page.locator(
      '.chat-composer textarea, .chat-composer [contenteditable], [class*="composer"] textarea, [class*="composer"] [contenteditable]'
    )
    const firstInput = input.first()
    await expect(firstInput).toBeVisible({ timeout: 10_000 })

    await firstInput.click()
    await firstInput.fill('Hello, this is a test message')

    // Verify text was entered
    const value = await firstInput.inputValue().catch(() => firstInput.textContent())
    expect(value).toContain('test message')
  })
})

test.describe('AI Chat — Editor sidebar', () => {
  /** Helper: navigate to editor in demo mode. */
  async function navigateToEditor(page: import('@playwright/test').Page) {
    await page.goto('/editor')
    if (page.url().includes('/demo')) {
      await page.evaluate(() => {
        sessionStorage.setItem('demoMode', 'true')
      })
      await page.goto('/editor')
    }
    return page.url().includes('/editor')
  }

  test('editor page loads without the AI sidebar by default', async ({ page }) => {
    const reached = await navigateToEditor(page)

    if (!reached) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Wait for editor to be ready
    await expect(page.locator('.editor-view')).toBeVisible({ timeout: 10_000 })

    // AI sidebar should NOT be visible by default (rightPanelVisible starts false)
    const aiSidebar = page.locator('.ai-sidebar, [class*="ai-sidebar"]')
    await expect(aiSidebar).not.toBeVisible()
  })
})

test.describe('AI Chat — Live API', () => {
  test.skip(!HAS_API, 'Skipped: E2E_HAS_API env var not set')

  test('sending a message shows loading state', async ({ page }) => {
    const reached = await gotoWithDemo(page, '/')

    if (!reached) {
      test.skip(true, 'Could not access home page')
      return
    }

    const input = page.locator(
      '.chat-composer textarea, .chat-composer [contenteditable], [class*="composer"] textarea'
    )
    const firstInput = input.first()
    await expect(firstInput).toBeVisible({ timeout: 10_000 })

    await firstInput.click()
    await firstInput.fill('What is 2 + 2?')

    // Press Enter or click send button to submit
    const sendBtn = page.locator(
      'button[type="submit"], .chat-composer button[class*="send"], [class*="composer"] button'
    )
    const sendBtnVisible = await sendBtn
      .first()
      .isVisible()
      .catch(() => false)

    if (sendBtnVisible) {
      await sendBtn.first().click()
    } else {
      await firstInput.press('Enter')
    }

    // Should see some loading indicator or the message appearing in the thread
    const loadingOrMessage = page.locator(
      '[class*="loading"], [class*="spinner"], [class*="message"], [class*="chat-message"]'
    )
    await expect(loadingOrMessage.first()).toBeVisible({ timeout: 10_000 })
  })
})

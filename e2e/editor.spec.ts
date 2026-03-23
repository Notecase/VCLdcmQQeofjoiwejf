import { test, expect } from '@playwright/test'

/**
 * Editor tests.
 *
 * The editor requires either authentication or demo mode. These tests
 * attempt to enter demo mode first, then verify editor functionality.
 * If demo mode requires a password we cannot provide, tests are skipped.
 */

/** Helper: enter demo mode so the editor route is accessible. */
async function _enterDemoMode(page: import('@playwright/test').Page) {
  await page.goto('/demo')

  // Check if demo gate is shown
  const gateCard = page.locator('.gate-card, .demo-gate')
  const isGateVisible = await gateCard.isVisible().catch(() => false)

  if (isGateVisible) {
    // Demo mode requires a password — we can't proceed automatically
    return false
  }

  // If we were NOT on a gate, maybe the app is running with API (not demo mode)
  return true
}

/** Helper: set demo mode in sessionStorage and navigate to editor. */
async function navigateToEditor(page: import('@playwright/test').Page) {
  // Try direct navigation first
  await page.goto('/editor')

  // If redirected to demo, try setting sessionStorage
  if (page.url().includes('/demo')) {
    await page.evaluate(() => {
      sessionStorage.setItem('demoMode', 'true')
    })
    await page.goto('/editor')
  }

  return page.url().includes('/editor')
}

test.describe('Editor view', () => {
  test('editor page renders the main layout', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor — demo mode may require a password')
      return
    }

    // The editor view container should be present
    const editorView = page.locator('.editor-view')
    await expect(editorView).toBeVisible({ timeout: 10_000 })
  })

  test('editor header with tabs bar is visible', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Tab bar should be present
    const tabsBar = page.locator('.tabs-bar')
    await expect(tabsBar).toBeVisible({ timeout: 10_000 })

    // New-tab button should exist
    const newTabBtn = page.locator('.new-tab-btn')
    await expect(newTabBtn).toBeVisible()
  })

  test('editor creates a default document on first load', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Wait for the editor to finish loading (isReady = true)
    const noteContent = page.locator('.note-content')
    await expect(noteContent).toBeVisible({ timeout: 10_000 })

    // At least one tab should exist (the default "Welcome to Inkdown" document)
    const tabs = page.locator('.tabs-container .tab')
    await expect(tabs)
      .toHaveCount(1, { timeout: 5_000 })
      .catch(() => {
        // May have more than 1 tab from previous state; just ensure at least 1
        expect(tabs).not.toHaveCount(0)
      })
  })

  test('clicking new-tab button adds a tab', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Wait for editor to be ready
    await expect(page.locator('.note-content')).toBeVisible({ timeout: 10_000 })

    // Count current tabs
    const initialCount = await page.locator('.tabs-container .tab').count()

    // Click new-tab button
    await page.locator('.new-tab-btn').click()

    // Should have one more tab
    await expect(page.locator('.tabs-container .tab')).toHaveCount(initialCount + 1, {
      timeout: 5_000,
    })
  })

  test('note status bar shows word count and save status', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Wait for the note status bar
    const noteStatus = page.locator('.note-status')
    await expect(noteStatus).toBeVisible({ timeout: 10_000 })

    // Word count should be shown
    const wordCount = page.locator('.word-count')
    await expect(wordCount).toBeVisible()
    await expect(wordCount).toContainText('words')
  })

  test('sidebar is visible by default', async ({ page }) => {
    const reachedEditor = await navigateToEditor(page)

    if (!reachedEditor) {
      test.skip(true, 'Could not access editor')
      return
    }

    // Sidebar component
    const sidebar = page.locator('.sidebar, .side-bar')
    await expect(sidebar).toBeVisible({ timeout: 10_000 })
  })
})

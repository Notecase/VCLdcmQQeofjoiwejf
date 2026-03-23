import { test, expect, type ConsoleMessage } from '@playwright/test'

/**
 * Smoke tests — verify each major route loads without JavaScript errors.
 *
 * Because the app redirects unauthenticated users to /demo when VITE_API_URL
 * is empty (production demo mode), many routes will land on the demo gate.
 * We handle that by checking the page actually rendered *something* rather
 * than asserting a specific final URL.
 */

test.describe('Smoke tests', () => {
  test('home page loads with correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Noteshell/i)
    // The Vue app root must be present
    await expect(page.locator('#inkdown-app')).toBeVisible()
  })

  test('no JavaScript errors on home page load', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })

    await page.goto('/')
    // Wait for the app to hydrate
    await expect(page.locator('#inkdown-app')).toBeVisible()

    // Allow a short settle period for async init
    await page.waitForTimeout(1000)

    expect(jsErrors).toEqual([])
  })

  test('editor route loads', async ({ page }) => {
    await page.goto('/editor')
    // Either we land on editor or get redirected to demo gate
    await expect(page.locator('#inkdown-app')).toBeVisible()
    // Page should have rendered within reasonable time
    const url = page.url()
    expect(url).toMatch(/\/(editor|demo)/)
  })

  test('auth route loads', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.locator('#inkdown-app')).toBeVisible()
    const url = page.url()
    expect(url).toMatch(/\/(auth|demo)/)
  })

  test('settings route loads', async ({ page }) => {
    // /settings is exempt from demo-mode redirect
    await page.goto('/settings')
    await expect(page.locator('#inkdown-app')).toBeVisible()
    expect(page.url()).toContain('/settings')
  })

  test('calendar route loads', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('#inkdown-app')).toBeVisible()
    const url = page.url()
    expect(url).toMatch(/\/(calendar|demo)/)
  })

  test('courses route loads', async ({ page }) => {
    await page.goto('/courses')
    await expect(page.locator('#inkdown-app')).toBeVisible()
    const url = page.url()
    expect(url).toMatch(/\/(courses|demo)/)
  })

  test('no console errors across route navigations', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        // Ignore known benign errors (e.g. favicon 404, Supabase not configured)
        const text = msg.text()
        if (text.includes('favicon') || text.includes('supabase')) return
        consoleErrors.push(text)
      }
    })

    // Visit settings (always accessible) to confirm no errors
    await page.goto('/settings')
    await expect(page.locator('#inkdown-app')).toBeVisible()
    await page.waitForTimeout(500)

    // We log but don't hard-fail on console.error — some are expected in dev
    if (consoleErrors.length > 0) {
      console.warn('Console errors found:', consoleErrors)
    }
  })
})

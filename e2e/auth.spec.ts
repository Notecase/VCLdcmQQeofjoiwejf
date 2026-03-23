import { test, expect } from '@playwright/test'

/**
 * Auth flow tests.
 *
 * The /auth route renders a login/signup form with email+password fields
 * and OAuth buttons. In demo mode the route may redirect to /demo instead,
 * so tests handle both cases.
 */

test.describe('Auth page', () => {
  test('renders the auth card with sign-in / sign-up tabs', async ({ page }) => {
    await page.goto('/auth')

    // If we were redirected to demo gate, skip auth-specific checks
    if (page.url().includes('/demo')) {
      test.skip(true, 'Redirected to demo gate — auth page not directly accessible')
      return
    }

    // Auth card should be visible
    const authCard = page.locator('.auth-card')
    await expect(authCard).toBeVisible()

    // Should have Sign In and Sign Up tab buttons
    await expect(authCard.getByText('Sign In')).toBeVisible()
    await expect(authCard.getByText('Sign Up')).toBeVisible()
  })

  test('auth form has email and password inputs', async ({ page }) => {
    await page.goto('/auth')

    if (page.url().includes('/demo')) {
      test.skip(true, 'Redirected to demo gate')
      return
    }

    // Email input
    const emailInput = page.locator('input[type="email"], input[placeholder*="Email" i]')
    await expect(emailInput).toBeVisible()

    // Password input
    const passwordInput = page.locator('input[type="password"], input[placeholder*="Password" i]')
    await expect(passwordInput).toBeVisible()
  })

  test('can toggle between sign-in and sign-up modes', async ({ page }) => {
    await page.goto('/auth')

    if (page.url().includes('/demo')) {
      test.skip(true, 'Redirected to demo gate')
      return
    }

    const signUpButton = page.locator('.auth-tabs button', { hasText: 'Sign Up' })
    await signUpButton.click()

    // After clicking sign-up, it should be the active tab
    await expect(signUpButton).toHaveClass(/active/)

    const signInButton = page.locator('.auth-tabs button', { hasText: 'Sign In' })
    await signInButton.click()
    await expect(signInButton).toHaveClass(/active/)
  })

  test('unauthenticated access to /editor redirects appropriately', async ({ page }) => {
    await page.goto('/editor')

    // Should either show the editor (local/demo mode) or redirect to demo gate
    const url = page.url()
    expect(url).toMatch(/\/(editor|demo|auth)/)

    // Regardless of where we land, the app should render
    await expect(page.locator('#inkdown-app')).toBeVisible()
  })
})

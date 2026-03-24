# Login Screen Redesign & Auth Fix

**Date:** 2026-03-24
**Status:** Approved

## Overview

Redesign the NoteShell login screen from a basic centered card to a bold, branded split-screen layout. Fix the email confirmation flow and remove the unconfigured GitHub OAuth option.

## Design Decisions

| Decision           | Choice                    | Rationale                                                             |
| ------------------ | ------------------------- | --------------------------------------------------------------------- |
| Layout             | Split screen              | Brand panel left, form right. Premium feel, room for product showcase |
| Color              | Purple → Amber gradient   | Dynamic, unique, warm. Avoids deep blue per user preference           |
| Brand content      | Product screenshot mockup | Most credible, shows the actual product                               |
| OAuth              | Google only               | GitHub not configured in Supabase, remove to avoid confusion          |
| Email confirmation | Inline success state      | Keep email verification but show friendly success UI, not error       |

## Part 1: Login Screen Redesign

### Layout Structure

```
┌──────────────────────────────────────────────────┐
│  ┌─────────────────────┬──────────────────────┐  │
│  │                     │                      │  │
│  │   BRAND PANEL       │   AUTH FORM           │  │
│  │   (flex: 1)         │   (440px fixed)      │  │
│  │                     │                      │  │
│  │   Logo + tagline    │   Welcome back       │  │
│  │                     │   subtitle            │  │
│  │   Product           │   [Sign In] [Sign Up] │  │
│  │   Screenshot        │                      │  │
│  │   (mockup)          │   [Continue w/ Google]│  │
│  │                     │   ───── or ─────     │  │
│  │                     │   Email input         │  │
│  │                     │   Password input      │  │
│  │   "Write.Think.     │   [Sign In button]   │  │
│  │    Learn."          │                      │  │
│  │                     │   Skip link          │  │
│  └─────────────────────┴──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Brand Panel (Left)

- **Background:** `linear-gradient(135deg, #1a0a20 0%, #2d1030 25%, #3d1a20 55%, #2d1a0a 100%)`
- **Ambient orbs:** Two blurred radial gradients (purple top-left, amber bottom-right)
- **Logo lockup:** 36px icon (purple→amber gradient, rounded square) + "NoteShell" text
- **Subtitle:** "AI-powered learning workspace" in muted white
- **Center:** Stylized product screenshot showing the editor with sidebar, content area, and AI suggestion block
- **Bottom:** "Write. Think. Learn." tagline + "AI that helps you understand, not just answer"

### Auth Form (Right)

- **Background:** `#141414`
- **Width:** 440px fixed on desktop
- **Header:** "Welcome back" (22px, semibold) / "Sign in to continue to NoteShell" (13px, muted)
- **Tab switcher:** Pill-style in `#0a0a0a` container, active tab has purple highlight with border
- **Google OAuth:** Full-width button at top with Google "G" icon, before the email form
- **Divider:** "or" separator with lines
- **Email input:** Labeled, dark (#0a0a0a) background, 44px height, 8px radius
- **Password input:** Labeled with "Forgot?" link aligned right, same styling
- **Submit button:** Purple→Amber gradient (`linear-gradient(135deg, #a855f7, #d97706)`), 44px, subtle glow shadow
- **Skip link:** "Continue without account →" at bottom, muted

### Mobile Responsive (< 768px)

- Brand panel collapses to a compact header: logo + tagline only, ~100px height
- Form takes full width with horizontal padding
- Product screenshot hidden on mobile

## Part 2: Auth Flow Fixes

### 2a. Email Confirmation — Success State

**Problem:** Sign-up with email confirmation returns `EMAIL_CONFIRMATION_REQUIRED` as an error, displayed as a red alert. Users see no confirmation email.

**Solution:**

1. **Detect `EMAIL_CONFIRMATION_REQUIRED`** in `handleSubmit()` as a success case, not an error
2. **Show inline success state** replacing the form:
   - Green checkmark circle (56px)
   - "Check your email" heading
   - User's email address displayed
   - "Didn't receive it? Check your spam folder." hint
   - "Resend email" button
3. **Add a new `signUpState` ref** to manage: `'form' | 'success'`

**Layer 1 — Supabase adapter (`auth.adapter.ts`):** No changes. Keep returning `{ data: null, error: { code: 'EMAIL_CONFIRMATION_REQUIRED', ... } }`. This honestly represents the state (no session yet).

**Layer 2 — Auth store (`stores/auth.ts`):** Change `signUp` to detect `EMAIL_CONFIRMATION_REQUIRED` and return it as a result instead of throwing:

```typescript
async signUp(email: string, password: string): Promise<{ confirmationRequired: boolean }> {
  this.isLoading = true
  this.error = null
  try {
    const auth = getAuthService()
    const result = await auth.signUp({ email, password })
    if (result.error) {
      if (result.error.code === 'EMAIL_CONFIRMATION_REQUIRED') {
        return { confirmationRequired: true }
      }
      throw new Error(result.error.message)
    }
    return { confirmationRequired: false }
  } catch (e: any) {
    this.error = e.message
    throw e
  } finally {
    this.isLoading = false
  }
}
```

**Layer 3 — AuthView.vue:** Consume the store's return value:

```typescript
const signUpState = ref<'form' | 'success'>('form')
const signUpEmail = ref('')

async function handleSubmit() {
  isLoading.value = true
  error.value = ''
  try {
    if (isLogin.value) {
      await authStore.signIn(email.value, password.value)
      router.push((route.query.redirect as string) || '/')
    } else {
      const result = await authStore.signUp(email.value, password.value)
      if (result.confirmationRequired) {
        signUpEmail.value = email.value
        signUpState.value = 'success'
      } else {
        router.push((route.query.redirect as string) || '/')
      }
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}
```

**Post-confirmation redirect:** Add a watcher for `authStore.isAuthenticated` in AuthView.vue so that when the user confirms their email and Supabase fires `SIGNED_IN`, they are automatically redirected:

```typescript
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      router.push((route.query.redirect as string) || '/')
    }
  }
)
```

**Input approach:** Use native HTML `<input>` elements with scoped CSS instead of Element Plus `el-input`. The heavy customization needed (dark bg, gradient button, custom label positioning) is simpler with native inputs than fighting Element Plus defaults.

**Local adapter note:** The local adapter's `signUp` always returns a session immediately, so the confirmation success UI will only appear in Supabase mode. This is expected behavior — local mode is for development.

### 2b. Investigate Email Delivery

The email confirmation may not be sending because:

1. **Supabase free tier SMTP limits** — Supabase's built-in email has a 4 emails/hour rate limit on free tier
2. **Custom SMTP not configured** — Check Supabase dashboard → Auth → Email Templates / SMTP Settings
3. **Email going to spam** — The default Supabase sender may trigger spam filters
4. **Site URL / Redirect URL misconfigured** — Check Supabase Auth settings for correct redirect URLs

**Action items:**

- Check Supabase Dashboard → Authentication → Email Templates
- Check Supabase Dashboard → Authentication → URL Configuration (Site URL should be `https://app.noteshell.io`)
- Check Supabase Dashboard → Project Settings → Auth → SMTP (consider adding custom SMTP like Resend)
- Test with Supabase Auth logs to confirm emails are being queued

### 2c. Remove GitHub OAuth

- Remove the GitHub button from the template
- Remove `handleOAuth('github')` handler (or just never call it)
- Keep the `signInWithOAuth` method in store generic (supports future providers)
- Update `handleOAuth` type to `'google'` only in the component

## Files to Modify

| File                                             | Changes                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `apps/web/src/views/AuthView.vue`                | Complete template + style rewrite, add success state logic    |
| `apps/web/src/stores/auth.ts`                    | Handle `EMAIL_CONFIRMATION_REQUIRED` as non-error in `signUp` |
| `apps/web/src/services/supabase/auth.adapter.ts` | Potentially adjust `signUp` return for confirmation case      |

## Files NOT Modified

- No new files created
- No changes to routing, stores (except auth), services (except auth adapter), or packages
- No database migrations needed

## Out of Scope

- Custom SMTP setup (requires Supabase dashboard, not code)
- Password reset flow redesign
- Email template customization (Supabase dashboard)
- Adding new OAuth providers

import { expect, test, type Page } from '@playwright/test'

// TODO 4.1 AC: staff and non-staff paths. The e2e build points at a
// placeholder Supabase URL (see `test:e2e`), and these tests answer its auth
// and REST calls, so CI needs no live project.

const USER_ID = '00000000-0000-0000-0000-0000000000aa'
const EMAIL = 'staff@prolog.test'

// The init script runs in the browser; e2e code is typed without the DOM lib.
declare const localStorage: { setItem(key: string, value: string): void }

/** Starts the page with a stored session, as after following a magic link. */
async function signedIn(page: Page) {
  const session = JSON.stringify({
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: EMAIL,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-01T00:00:00Z',
    },
  })
  // Same key as `storageKey` in src/lib/supabase.ts.
  await page.addInitScript((value) => {
    localStorage.setItem('prolog-moneyball-auth', value)
  }, session)
}

/** Answers the staff lookup with this role, or with no row. */
async function staffRow(page: Page, role: string | null) {
  await page.route('**/rest/v1/staff?**', (route) =>
    route.fulfill({ json: role ? [{ role }] : [] }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/otp')) return route.fulfill({ json: {} })
    if (url.includes('/logout')) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 404, json: {} })
  })
})

test('signed out: every staff view asks for a sign-in link', async ({ page }) => {
  await page.goto('#/compare')
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)

  const otp = page.waitForRequest('**/auth/v1/otp**')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Send Sign-In Link' }).click()
  const body = (await otp).postDataJSON() as { email: string; create_user: boolean }
  expect(body).toMatchObject({ email: EMAIL, create_user: false })
  await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible()
})

test('staff: signed in with their role, then signed out', async ({ page }) => {
  await signedIn(page)
  await staffRow(page, 'analyst')
  await page.goto('#/squad')

  await expect(page.getByRole('heading', { name: 'Squad', level: 1 })).toBeVisible()
  await expect(page.getByText(`${EMAIL} · Analyst`)).toBeVisible()
  // The mock role switcher is for dev builds only.
  await expect(page.getByLabel('Viewing As')).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign Out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
})

test('staff: role-aware settings follow the real role', async ({ page }) => {
  await signedIn(page)
  await staffRow(page, 'coach')
  await page.goto('#/settings')
  await expect(page.getByRole('heading', { name: 'PA Priors' })).toBeVisible()
})

test('not on the staff list: no access, and sign out', async ({ page }) => {
  await signedIn(page)
  await staffRow(page, null)
  await page.goto('#/squad')

  await expect(page.getByRole('heading', { name: 'No Access' })).toBeVisible()
  await expect(page.getByText(`signed in as ${EMAIL}`)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign Out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
})

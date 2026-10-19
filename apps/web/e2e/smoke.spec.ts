import { expect, test } from '@playwright/test'

test('production build loads from the sub-path', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('PROLOG Moneyball')
  await expect(page.getByRole('main', { name: 'PROLOG Moneyball' })).toBeAttached()
})

test('a deep link survives a hard refresh', async ({ page }) => {
  await page.goto('#/dev/palette')
  await expect(page.getByRole('heading', { name: 'Palette', level: 1 })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/prolog-moneyball\/#\/dev\/palette$/)
  await expect(page.getByRole('heading', { name: 'Palette', level: 1 })).toBeVisible()
})

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('#/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible()
})

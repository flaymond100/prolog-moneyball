import { expect, test } from '@playwright/test'

test('production build loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('PROLOG Moneyball')
  await expect(page.getByRole('main', { name: 'PROLOG Moneyball' })).toBeAttached()
})

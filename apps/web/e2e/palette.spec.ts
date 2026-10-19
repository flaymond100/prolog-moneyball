import { expect, test } from '@playwright/test'

test('dev palette renders rating chips 1–20 in both palettes', async ({ page }) => {
  await page.goto('/#/dev/palette')
  for (const title of ['Default Palette', 'Colour-Blind-Safe Palette']) {
    await expect(
      page.getByRole('list', { name: `Rating chips 1–20, ${title}` }).getByRole('listitem'),
    ).toHaveCount(20)
  }
})

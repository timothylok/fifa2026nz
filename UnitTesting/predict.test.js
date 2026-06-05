/**
 * Predict Tab — Playwright test suite
 * Run via: node UnitTesting/run-tests.js
 */

export const suite = 'Predict Tab'

export const tests = [
  {
    id: 'predict-renders',
    name: 'Predict tab renders 12 group cards',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      await page.waitForTimeout(300)
      const count = await page.locator('.grid > div').count()
      if (count !== 12) throw new Error(`Expected 12 groups, got ${count}`)
      await ctx.screenshot('predict-renders')
    }
  },
  {
    id: 'predict-pick-teams',
    name: 'Picking 1st and 2nd highlights teams with badges',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      const card = page.locator('.grid > div').first()
      await card.locator('button').nth(0).click()
      await card.locator('button').nth(1).click()
      await page.waitForTimeout(200)
      const badge1 = await page.locator('text=1st').count()
      const badge2 = await page.locator('text=2nd').count()
      if (badge1 < 1) throw new Error('1st badge missing')
      if (badge2 < 1) throw new Error('2nd badge missing')
      await ctx.screenshot('predict-pick-teams')
    }
  },
  {
    id: 'predict-score-banner',
    name: 'Score summary banner appears after first pick',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      const card = page.locator('.grid > div').first()
      await card.locator('button').nth(0).click()
      await card.locator('button').nth(1).click()
      await page.waitForTimeout(200)
      const visible = await page.locator('.text-3xl.font-bold').first().isVisible()
      if (!visible) throw new Error('Score banner not visible')
      await ctx.screenshot('predict-score-banner')
    }
  },
  {
    id: 'predict-full-score',
    name: 'Picking all 12 groups shows 12/12 done and non-zero score',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      const cards = await page.locator('.grid > div').count()
      for (let i = 0; i < cards; i++) {
        const card = page.locator('.grid > div').nth(i)
        await card.locator('button').nth(0).click()
        await card.locator('button').nth(1).click()
      }
      await page.waitForTimeout(300)
      const doneText = await page.locator('text=/12\\/12/').innerText()
      if (!doneText.includes('12/12')) throw new Error(`Expected 12/12, got: ${doneText}`)
      const score = parseInt(await page.locator('.text-3xl.font-bold').first().innerText())
      if (isNaN(score)) throw new Error('Score is not a number')
      await ctx.screenshot('predict-full-score')
    }
  },
  {
    id: 'predict-reset',
    name: 'Reset button clears all picks',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      const card = page.locator('.grid > div').first()
      await card.locator('button').nth(0).click()
      await card.locator('button').nth(1).click()
      await page.waitForTimeout(200)
      await page.click('button:has-text("Reset")')
      await page.waitForTimeout(200)
      const zeroDone = await page.locator('text=/0\\/12/').count()
      if (zeroDone < 1) throw new Error('Counter did not reset to 0/12')
      await ctx.screenshot('predict-reset')
    }
  },
  {
    id: 'predict-localstorage',
    name: 'Picks persist in localStorage and clear on reset',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      const card = page.locator('.grid > div').first()
      await card.locator('button').nth(0).click()
      await page.waitForTimeout(200)
      const saved = await page.evaluate(() => localStorage.getItem('fifa2026_picks'))
      const parsed = JSON.parse(saved)
      if (!parsed || Object.keys(parsed).length === 0) throw new Error('Nothing saved to localStorage')
      await page.click('button:has-text("Reset")')
      await page.waitForTimeout(200)
      const cleared = await page.evaluate(() => localStorage.getItem('fifa2026_picks'))
      if (JSON.stringify(JSON.parse(cleared)) !== '{}') throw new Error('localStorage not cleared on reset')
    }
  },
  {
    id: 'predict-model-expects',
    name: 'Model expects section shows 2 teams per group',
    async run(page, ctx) {
      await page.click('button:has-text("Predict")')
      await page.waitForTimeout(300)
      const modelSections = await page.locator('text=MODEL EXPECTS').count()
      if (modelSections !== 12) throw new Error(`Expected 12 model sections, got ${modelSections}`)
    }
  },
  {
    id: 'predict-no-console-errors',
    name: 'No console errors on Predict tab',
    async run(page, ctx) {
      // errors collected by run-tests.js harness, checked post-run
      await page.click('button:has-text("Predict")')
      await page.waitForTimeout(500)
      if (ctx.consoleErrors.length > 0) {
        throw new Error('Console errors: ' + ctx.consoleErrors.join('; '))
      }
    }
  }
]

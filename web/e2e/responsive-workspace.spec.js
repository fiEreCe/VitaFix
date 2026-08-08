import { expect, test } from '@playwright/test'
import {
  LONG_FACT,
  LONG_REQUIREMENT,
  installApiMocks,
  routeCases,
} from './fixtures.js'

const tabbableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
    rootClient: document.documentElement.clientWidth,
    rootScroll: document.documentElement.scrollWidth,
  }))
  expect(metrics.rootScroll, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.rootClient)
  expect(metrics.bodyScroll, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.bodyClient)
}

async function expectInsideOwner(textLocator, ownerSelector) {
  const bounds = await textLocator.evaluate((element, selector) => {
    const owner = element.closest(selector)
    if (!owner) return null
    const textBox = element.getBoundingClientRect()
    const ownerBox = owner.getBoundingClientRect()
    return {
      textLeft: textBox.left,
      textRight: textBox.right,
      textTop: textBox.top,
      textBottom: textBox.bottom,
      ownerLeft: ownerBox.left,
      ownerRight: ownerBox.right,
      ownerTop: ownerBox.top,
      ownerBottom: ownerBox.bottom,
    }
  }, ownerSelector)
  expect(bounds).not.toBeNull()
  expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.ownerLeft - 1)
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.ownerRight + 1)
  expect(bounds.textTop).toBeGreaterThanOrEqual(bounds.ownerTop - 1)
  expect(bounds.textBottom).toBeLessThanOrEqual(bounds.ownerBottom + 1)
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page)
})

for (const routeCase of routeCases) {
  test(`${routeCase.slug} has a responsive workspace`, async ({ page }, testInfo) => {
    if (routeCase.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/#${routeCase.path}`)
    await expect(page.locator('main')).toBeVisible()

    if (routeCase.slug === 'agent') {
      await expect(page.locator('.agent-stage')).toBeVisible()
      const columnCount = await page.locator('.agent-layout').evaluate((element) => (
        getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
      ))
      if (testInfo.project.name === 'phone') expect(columnCount).toBe(1)
      if (testInfo.project.name === 'desktop') expect(columnCount).toBeGreaterThanOrEqual(2)
    }

    if (routeCase.slug === 'demo') {
      const motion = await page.locator('.demo-detail').evaluate((element) => {
        const style = getComputedStyle(element)
        return { animationName: style.animationName, transform: style.transform }
      })
      expect(motion.animationName).toBe('none')
      expect(motion.transform).toBe('none')
    }

    await expectNoHorizontalOverflow(page)

    if (process.env.UPDATE_SCREENSHOTS === '1') {
      await page.screenshot({
        path: `e2e/screenshots/${testInfo.project.name}-${routeCase.slug}.png`,
        fullPage: true,
      })
    }
  })
}

test('API mocks fail closed for unknown paths and wrong methods', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.goto('/#/demo')

  const statuses = await page.evaluate(async () => {
    const status = async (path, method = 'GET') => {
      try {
        return (await fetch(path, { method })).status
      } catch {
        return 0
      }
    }
    return {
      unknown: await status('/api/unexpected'),
      wrongAnalysisMethod: await status('/api/analysis', 'POST'),
      wrongTrackMethod: await status('/api/track'),
      allowedTrackMethod: await status('/api/track', 'POST'),
    }
  })

  expect(statuses).toEqual({
    unknown: 404,
    wrongAnalysisMethod: 404,
    wrongTrackMethod: 404,
    allowedTrackMethod: 200,
  })
})

test('Agent-layout focus stays within its first five controls', async ({ page }) => {
  await page.goto('/#/agent/session-1')
  const scope = page.locator('.agent-layout')
  await expect(scope).toBeVisible()

  const scopedTabbables = scope.locator(tabbableSelector)
  const tabbableCount = await scopedTabbables.evaluateAll((elements) => {
    const tabbables = elements.filter((element) => {
      const style = getComputedStyle(element)
      return !element.disabled
        && element.getAttribute('aria-disabled') !== 'true'
        && element.tabIndex >= 0
        && element.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    })
    tabbables.forEach((element, index) => {
      element.dataset.e2eFocusOrder = String(index)
    })
    return tabbables.length
  })
  expect(tabbableCount).toBeGreaterThanOrEqual(5)

  for (let index = 0; index < 5; index += 1) {
    const control = page.locator(`[data-e2e-focus-order="${index}"]`)
    const before = await control.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        outline: `${style.outlineStyle}|${style.outlineWidth}|${style.outlineColor}|${style.outlineOffset}`,
        boxShadow: style.boxShadow,
      }
    })

    if (index === 0) await control.focus()
    else await page.keyboard.press('Tab')

    const after = await control.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        focused: document.activeElement === element,
        outline: `${style.outlineStyle}|${style.outlineWidth}|${style.outlineColor}|${style.outlineOffset}`,
        boxShadow: style.boxShadow,
        hasVisibleIndicator: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
          || style.boxShadow !== 'none',
        withinViewport: rect.left >= 0
          && rect.top >= 0
          && rect.right <= window.innerWidth
          && rect.bottom <= window.innerHeight,
      }
    })
    expect(after.focused, `Tab ${index + 1} did not reach its expected control`).toBe(true)
    expect(after.withinViewport, `Tab ${index + 1} focused outside the viewport`).toBe(true)
    expect(after.hasVisibleIndicator, `Tab ${index + 1} has no visible focus indicator`).toBe(true)
    expect(
      after.outline !== before.outline || after.boxShadow !== before.boxShadow,
      `Tab ${index + 1} focus styles did not change`,
    ).toBe(true)
  }
})

async function expectReachableWithoutClippedText(page, selector) {
  const locator = page.locator(selector).first()
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      hasBox: rect.width > 0 && rect.height > 0,
      horizontallyReachable: rect.right > 0 && rect.left < window.innerWidth,
      verticallyReachable: rect.bottom > 0 && rect.top < window.innerHeight,
      textFitsWidth: element.scrollWidth <= element.clientWidth + 1,
      textFitsHeight: element.scrollHeight <= element.clientHeight + 1,
    }
  })
  expect(result).toEqual({
    hasBox: true,
    horizontallyReachable: true,
    verticallyReachable: true,
    textFitsWidth: true,
    textFitsHeight: true,
  })
}

test('desktop Agent remains operable at 200% page scale', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
    await page.goto('/#/agent/session-1')

    await expectReachableWithoutClippedText(page, '.task-row[aria-current="step"]')
    await expectReachableWithoutClippedText(page, '.agent-stage .van-button--primary')
    await expectReachableWithoutClippedText(page, '.task-row[aria-current="step"] .task-row__state')
    await expectReachableWithoutClippedText(page, 'button[aria-label="返回上一页"]')
    await expectNoHorizontalOverflow(page)
  } finally {
    await cdp.detach()
  }
})

test('desktop result remains operable at 200% page scale', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
    await page.goto('/#/result/analysis-1')

    await expectReachableWithoutClippedText(page, '.grade')
    await expectReachableWithoutClippedText(page, '.bottom-actions .van-button--primary')
    await expectReachableWithoutClippedText(page, 'button[aria-label="返回上一页"]')
    await expectNoHorizontalOverflow(page)
  } finally {
    await cdp.detach()
  }
})

test('exact long Chinese requirement and fact stay inside their owning columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  expect(LONG_REQUIREMENT.length).toBeGreaterThan(120)
  expect(LONG_FACT.length).toBeGreaterThan(120)
  await page.goto('/#/result/analysis-1')
  await page.getByRole('tab', { name: 'JD要求匹配' }).click()

  const requirement = page.getByText(LONG_REQUIREMENT, { exact: true })
  const fact = page.getByText(LONG_FACT, { exact: true })
  await expect(requirement).toHaveCount(1)
  await expect(fact).toHaveCount(1)
  await expect(requirement).toBeVisible()
  await expect(fact).toBeVisible()
  await expectInsideOwner(requirement, '.requirement-item')
  await expectInsideOwner(fact, '.req-section')
})

import { expect, test } from '@playwright/test'
import { installApiMocks } from './fixtures.js'

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Agent history acceptance runs on desktop')
  await page.addInitScript(() => {
    window.__copied = []
    const clipboard = {
      writeText: async (text) => {
        window.__copied.push(text)
      },
    }
    try {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      })
    } catch {
      // 回退到页面级 clipboard 覆盖
    }
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboard,
      })
    } catch {
      // 无法覆盖时忽略，测试会读到空剪贴板并在断言中失败
    }
  })
  await installApiMocks(page)
})

test('an Agent session appears on Home and reopens the workbench', async ({ page }) => {
  await page.goto('/#/')

  const card = page.locator('a.history-card[href*="/agent/session-1"]').first()
  await expect(card).toBeVisible()
  await expect(card).toContainText('优化会话')
  await expect(card).toContainText('已完成 2/4 项')

  await card.click()
  await expect(page).toHaveURL(/#\/agent\/session-1$/)
  await expect(page.locator('.agent-stage')).toBeVisible()
  await expect(page.getByRole('button', { name: '查看最终结果汇总' })).toBeVisible()
})

test('History lists Agent and legacy Analysis records and opens the multi-task summary', async ({ page }) => {
  await page.goto('/#/history')

  await expect(page.getByText('合成岗位匹配分析')).toBeVisible()
  await expect(page.locator('.history-card').filter({ hasText: '优化会话' })).toContainText('示例组织 · 产品岗位')

  await page.getByRole('button', { name: '查看优化汇总：示例组织 · 产品岗位' }).click()
  await expect(page).toHaveURL(/#\/agent\/session-1\/summary$/)

  await expect(page.locator('.task-card')).toHaveCount(5)
  await expect(page.getByText('已采用 · 风险已确认')).toBeVisible()
  await expect(page.getByText('草稿 · 未验证')).toBeVisible()
  await expect(page.getByText('候选 · 待决定')).toBeVisible()
  await expect(page.getByText('数量缺少事实依据')).toBeVisible()

  await page.reload()
  await expect(page.locator('.task-card')).toHaveCount(5)
  await expect(page.getByText('独立推动 500 人跨团队协作')).toBeVisible()
})

test('batch copy scopes match the visible expressions and return links reopen the right task', async ({ page }) => {
  await page.goto('/#/agent/session-1/summary')

  await page.getByRole('button', { name: '复制已采用表达（2）' }).click()
  await expect.poll(async () => page.evaluate(() => window.__copied.length)).toBe(1)

  const adopted = await page.evaluate(() => window.__copied[0])
  expect(adopted).toContain('完成用户研究并输出关键洞察')
  expect(adopted).toContain('独立推动 500 人跨团队协作')
  expect(adopted).toContain('风险已确认')
  expect(adopted).not.toContain('独立完成数据分析并复盘')
  expect(adopted).not.toContain('主导项目复盘并形成行动项')

  await page.getByRole('button', { name: '复制全部表达（4）' }).click()
  await expect.poll(async () => page.evaluate(() => window.__copied.length)).toBe(2)

  const all = await page.evaluate(() => window.__copied[1])
  expect(all).toContain('独立完成数据分析并复盘')
  expect(all).toContain('草稿 · 未验证')
  expect(all).toContain('主导项目复盘并形成行动项')
  expect(all).toContain('候选 · 待决定')

  const secondTask = page.locator('.task-card').nth(1)
  await secondTask.getByRole('button', { name: '返回工作台继续处理' }).click()
  await expect(page).toHaveURL(/#\/agent\/session-1\?task=task-2$/)
  await expect(page.locator('.task-row[aria-current="step"]')).toContainText('能够基于合成数据验证方案效果')
})

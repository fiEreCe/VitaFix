import { expect, test } from '@playwright/test'

const REQUIREMENT = '负责用户研究并形成洞察'

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(body),
})

function pendingSession() {
  return {
    id: 'session-facts',
    jdId: 'jd-1',
    resumeId: 'resume-1',
    state: 'task_in_progress',
    currentTaskId: 'task-1',
    requirements: [{ id: 'requirement-1', sourceText: REQUIREMENT }],
    resumeFacts: [{
      id: 'fact-1',
      sourceText: '参与校园用户访谈',
      action: '参与用户访谈',
      context: '校园产品',
      contribution: '团队共同完成',
      method: '半结构化访谈',
      result: '输出用户洞察',
      quantity: '8',
      confirmation: 'pending_confirmation',
      confirmationSource: 'auto',
    }],
    tasks: [{
      id: 'task-1',
      requirementId: 'requirement-1',
      factIds: ['fact-1'],
      gapType: 'expression',
      recommended: true,
      state: 'awaiting_fact_confirmation',
      pendingFactId: 'fact-1',
      effectiveRounds: 0,
    }],
  }
}

function generatingSession() {
  const session = pendingSession()
  session.resumeFacts = [{
    ...session.resumeFacts[0],
    id: 'fact-2',
    action: '独立设计访谈提纲并访谈 8 位用户',
    confirmation: 'corrected',
    confirmationSource: 'user',
    originalFactId: 'fact-1',
  }, session.resumeFacts[0]]
  session.tasks[0] = {
    ...session.tasks[0],
    factIds: ['fact-2'],
    state: 'generating',
    pendingFactId: '',
  }
  return session
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Fact confirmation acceptance runs on desktop')
  await page.addInitScript(() => {
    localStorage.clear()
  })
})

test('pending extracted facts are reviewed and corrected before generation', async ({ page }) => {
  let current = pendingSession()
  let correctionBody = null

  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, (route) => json(
    route,
    { error: { code: 'E2E_NOT_MOCKED', message: '未模拟的接口' } },
    404,
  ))
  await page.route(/\/api\/agent-sessions\/session-facts$/, (route) => json(route, current))
  await page.route(
    /\/api\/agent-sessions\/session-facts\/tasks\/task-1\/facts\/fact-1$/,
    (route) => {
      correctionBody = route.request().postDataJSON()
      current = generatingSession()
      return json(route, current)
    },
  )

  await page.goto('/#/agent/session-facts')

  const stage = page.getByLabel('当前优化任务')
  await expect(stage.getByText('请核对将进入候选审核的事实')).toBeVisible()
  await expect(stage.getByText('个人行动', { exact: true })).toBeVisible()
  await expect(stage.getByText('参与用户访谈', { exact: true }).first()).toBeVisible()
  await expect(stage.getByText('半结构化访谈', { exact: true }).first()).toBeVisible()
  await expect(stage.getByText('输出用户洞察', { exact: true }).first()).toBeVisible()
  await expect(stage.getByText('待你确认').first()).toBeVisible()

  await page.getByRole('button', { name: '修正内容' }).click()
  await page.locator('.fact-correction__field textarea').first()
    .fill('独立设计访谈提纲并访谈 8 位用户')
  await page.getByRole('button', { name: '保存修正并确认' }).click()

  await expect.poll(() => correctionBody).toEqual({
    decision: 'correct',
    fact: { action: '独立设计访谈提纲并访谈 8 位用户' },
  })
  await expect(page.getByRole('button', { name: '生成候选表达' })).toBeVisible()
  await expect(page.getByText('用户已修正').first()).toBeVisible()
})

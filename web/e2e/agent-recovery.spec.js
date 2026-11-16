import { expect, test } from '@playwright/test'

const REQUIREMENT = '负责用户研究并形成洞察'
const FACT = '设计访谈提纲并访谈 8 位用户'

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(body),
})

function makeSession(overrides = {}) {
  return {
    id: 'session-recovery',
    jdId: 'jd-1',
    resumeId: 'resume-1',
    state: 'draft',
    currentTaskId: '',
    requirements: [{ id: 'requirement-1', sourceText: REQUIREMENT }],
    resumeFacts: [{ id: 'fact-1', sourceText: FACT, confirmation: 'confirmed' }],
    matches: [],
    transitions: [],
    tasks: [],
    ...overrides,
  }
}

const pendingTask = (state = 'pending') => ({
  id: 'task-1',
  requirementId: 'requirement-1',
  factIds: ['fact-1'],
  gapType: 'expression',
  recommended: true,
  state,
  effectiveRounds: 0,
})

async function installAgentRoutes(page, { session, get, start, decision } = {}) {
  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, (route) => json(
    route,
    { error: { code: 'E2E_NOT_MOCKED', message: '未模拟的接口' } },
    404,
  ))

  if (get) {
    await page.route(/\/api\/agent-sessions\/session-recovery$/, (route) => get(route))
  } else {
    await page.route(/\/api\/agent-sessions\/session-recovery$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return json(route, typeof session === 'function' ? session() : session)
    })
  }

  await page.route(/\/api\/agent-sessions\/session-recovery\/start$/, async (route) => {
    return start(route)
  })

  if (decision) {
    await page.route(
      /\/api\/agent-sessions\/session-recovery\/tasks\/task-1\/decision$/,
      (route) => decision(route),
    )
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Agent recovery acceptance runs on desktop')
  await page.addInitScript(() => {
    localStorage.clear()
  })
})

test('start failure keeps the same session and retries it successfully', async ({ page }) => {
  let current = makeSession()
  let startCalls = 0
  const startUrls = []

  await installAgentRoutes(page, {
    session: () => current,
    start: async (route) => {
      startCalls += 1
      startUrls.push(route.request().url())
      if (startCalls === 1) {
        return json(route, { error: { code: 'AGENT_ANALYSIS_UNAVAILABLE', message: '服务暂时不可用' } }, 503)
      }
      current = makeSession({
        state: 'evidence_ready',
        tasks: [pendingTask()],
      })
      return json(route, current)
    },
  })

  await page.goto('/#/agent/session-recovery')

  await expect(page.getByText('分析启动失败')).toBeVisible()
  await expect(page.getByText('同一个会话')).toBeVisible()
  expect(startCalls).toBe(1)

  await page.getByRole('button', { name: '重试启动' }).click()

  await expect(page.locator('.task-row')).toContainText(REQUIREMENT)
  expect(startCalls).toBe(2)
  expect(new Set(startUrls).size).toBe(1)
})

test('parsing_failed offers a retry on the same session', async ({ page }) => {
  let current = makeSession({ state: 'parsing_failed' })
  let startCalls = 0

  await installAgentRoutes(page, {
    session: () => current,
    start: async (route) => {
      startCalls += 1
      current = makeSession({ state: 'evidence_ready', tasks: [pendingTask()] })
      return json(route, current)
    },
  })

  await page.goto('/#/agent/session-recovery')

  await expect(page.getByText('岗位或简历解析失败')).toBeVisible()
  await page.getByRole('button', { name: '重试分析' }).click()

  await expect(page.locator('.task-row')).toContainText(REQUIREMENT)
  expect(startCalls).toBe(1)
})

test('an expired analysis lease is recovered through the same session', async ({ page }) => {
  let current = makeSession({
    state: 'parsing',
    analysisClaimExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
  })
  let startCalls = 0

  await installAgentRoutes(page, {
    session: () => current,
    start: async (route) => {
      startCalls += 1
      current = makeSession({ state: 'evidence_ready', tasks: [pendingTask()] })
      return json(route, current)
    },
  })

  await page.goto('/#/agent/session-recovery')

  await expect(page.locator('.task-row')).toContainText(REQUIREMENT)
  expect(startCalls).toBe(1)
})

test('refreshing while parsing keeps the same session and continues waiting', async ({ page }) => {
  let getCalls = 0
  let startCalls = 0
  let current = makeSession({
    state: 'parsing',
    analysisClaimExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  })

  await installAgentRoutes(page, {
    get: (route) => {
      getCalls += 1
      if (getCalls >= 2) {
        current = makeSession({ state: 'evidence_ready', tasks: [pendingTask()] })
      }
      return json(route, current)
    },
    start: async (route) => {
      startCalls += 1
      return json(route, current)
    },
  })

  await page.goto('/#/agent/session-recovery')
  await expect(page.getByText('正在解析岗位与简历')).toBeVisible()

  await page.reload()

  await expect(page.locator('.task-row')).toContainText(REQUIREMENT)
  expect(startCalls).toBe(0)
})

test('capability_gap explains the missing evidence and can be skipped', async ({ page }) => {
  let current = makeSession({
    state: 'task_in_progress',
    tasks: [pendingTask('capability_gap')],
  })
  const decisions = []

  await installAgentRoutes(page, {
    session: () => current,
    start: async (route) => json(route, current),
    decision: async (route) => {
      decisions.push(route.request().postDataJSON())
      current = makeSession({
        state: 'task_in_progress',
        tasks: [pendingTask('skipped')],
      })
      return json(route, current)
    },
  })

  await page.goto('/#/agent/session-recovery')

  await expect(page.getByText('当前经历缺少这项证据')).toBeVisible()
  await expect(page.getByText('不会替你虚构事实')).toBeVisible()
  await page.getByRole('button', { name: '跳过这个任务' }).click()

  await expect(page.getByText('本任务已完成')).toBeVisible()
  expect(decisions).toEqual([{ type: 'skipped' }])
})

test('a missing session shows a restart entry tied to the same inputs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jingzhu_device_id', 'user_e2e')
    localStorage.setItem(
      'jingzhu_agent_pending_session:user_e2e',
      JSON.stringify({ id: 'session-recovery', jdId: 'jd-1', resumeId: 'resume-1', savedAt: Date.now() }),
    )
  })

  await installAgentRoutes(page, {
    get: (route) => json(route, {
      error: { code: 'AGENT_SESSION_NOT_FOUND', message: '会话不存在或无权访问' },
    }, 404),
    start: async (route) => json(route, makeSession()),
  })

  await page.goto('/#/agent/session-recovery')

  await expect(page.getByText('会话不存在或已过期')).toBeVisible()
  await page.getByRole('button', { name: '重新开始' }).click()

  await expect(page).toHaveURL(/#\/supplement\?jdId=jd-1&resumeId=resume-1&skip=1&fresh=1/)
})

test('creating a session enters the workbench immediately and starts there', async ({ page }) => {
  let createCalls = 0
  let startCalls = 0
  let current = makeSession()

  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, (route) => json(
    route,
    { error: { code: 'E2E_NOT_MOCKED', message: '未模拟的接口' } },
    404,
  ))
  await page.route(/\/api\/agent-sessions$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    createCalls += 1
    return json(route, { id: 'session-recovery', state: 'draft' }, 201)
  })
  await page.route(/\/api\/agent-sessions\/session-recovery$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return json(route, current)
  })
  await page.route(/\/api\/agent-sessions\/session-recovery\/start$/, async (route) => {
    startCalls += 1
    current = makeSession({
      state: 'parsing',
      analysisClaimExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    return json(route, current)
  })

  await page.goto('/#/supplement?jdId=jd-1&resumeId=resume-1&skip=1')

  await expect(page).toHaveURL(/#\/agent\/session-recovery$/)
  await expect(page.getByText('正在解析岗位与简历')).toBeVisible()
  expect(createCalls).toBe(1)
  expect(startCalls).toBe(1)

  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('jingzhu_agent_pending_session'))
    return key ? JSON.parse(localStorage.getItem(key)) : null
  })
  expect(saved).toMatchObject({ id: 'session-recovery', jdId: 'jd-1', resumeId: 'resume-1' })
})

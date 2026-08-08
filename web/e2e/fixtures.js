export const LONG_REQUIREMENT = '负责从业务目标出发完成用户研究、需求拆解、方案设计、跨团队协作、数据验证与复盘沉淀，并能清晰说明每个决策所依据的用户事实、约束条件、个人行动和可验证结果；面对信息不完整的复杂项目时，能够主动澄清范围、识别风险、设计可回退的验证路径，并持续向合作团队同步进展、结论和下一步计划。'

export const LONG_FACT = '在匿名课程项目中负责设计访谈提纲、组织可用性测试、归纳反馈主题、维护需求优先级并推动两轮原型验证；每轮均记录假设、观察、个人完成的分析动作和团队确认的结论，最终输出不含姓名、联系方式、公司名称或其他个人数据的合成研究摘要，供后续方案取舍与风险复盘使用。'

export const routeCases = [
  { path: '/', slug: 'home' },
  { path: '/jd-input', slug: 'jd-input' },
  { path: '/resume-input?jdId=jd-1', slug: 'resume-input' },
  { path: '/supplement?jdId=jd-1&resumeId=resume-1', slug: 'supplement' },
  { path: '/agent/session-1', slug: 'agent' },
  { path: '/result/analysis-1', slug: 'result' },
  { path: '/history', slug: 'history' },
  { path: '/demo', slug: 'demo', reducedMotion: true },
]

export const agentSessionFixture = {
  id: 'session-1',
  state: 'in_progress',
  currentTaskId: 'task-1',
  requirements: [
    { id: 'requirement-1', sourceText: LONG_REQUIREMENT, priority: 10 },
    { id: 'requirement-2', sourceText: '能够基于合成数据验证方案效果', priority: 8 },
  ],
  resumeFacts: [
    { id: 'fact-1', sourceText: LONG_FACT, confirmation: 'confirmed' },
    { id: 'fact-2', sourceText: '使用合成样本完成两轮方案验证', confirmation: 'confirmed' },
  ],
  tasks: [
    {
      id: 'task-1',
      requirementId: 'requirement-1',
      factIds: ['fact-1'],
      gapType: 'expression',
      recommended: true,
      state: 'awaiting_user_decision',
      effectiveRounds: 1,
      candidate: {
        text: '完成用户研究、需求拆解与两轮验证，并记录决策依据。',
        rationaleSummary: '仅使用已确认的合成事实。',
        verification: { status: 'passed', findings: [] },
      },
      validationRecords: [{
        safetyStatus: 'passed',
        changeOutcome: 'improved',
        diff: { before: '参与研究', after: '完成研究与验证' },
        remainingIssues: [],
      }],
    },
    {
      id: 'task-2',
      requirementId: 'requirement-2',
      factIds: ['fact-2'],
      gapType: 'expression',
      state: 'pending',
      effectiveRounds: 0,
    },
  ],
}

export const analysisFixture = {
  overallScore: 82,
  overallGrade: '良好',
  summary: '合成材料显示核心能力与岗位要求较匹配。',
  dimensions: [
    { name: '技能匹配', score: 84, detail: '研究与分析方法覆盖充分。' },
    { name: '经验匹配', score: 78, detail: '具备完整的合成项目验证经历。' },
    { name: '教育背景', score: 82, detail: '学习经历支持目标岗位能力。' },
  ],
  requirementChecklist: [{
    requirement: LONG_REQUIREMENT,
    status: 'partial',
    matchedSections: [{ label: '合成项目', evidence: LONG_FACT }],
    suggestion: '继续补充可验证结果。',
  }],
  sectionAnalysis: [],
}

export const historyFixture = {
  list: [{
    id: 'analysis-1',
    name: '合成岗位匹配分析',
    company: '示例组织',
    position: '产品岗位',
    createdAt: '2026-08-08T00:00:00.000Z',
    score: 82,
    grade: '良好',
  }],
}

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(body),
})

export async function installApiMocks(page) {
  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (method === 'POST' && path === '/api/track') return json(route, { accepted: true })

    if (method === 'GET' && path === '/api/agent-sessions/session-1') {
      return json(route, agentSessionFixture)
    }
    if (method === 'GET' && path === '/api/analysis/analysis-1/status') {
      return json(route, { status: 'completed' })
    }
    if (method === 'GET' && path === '/api/analysis/analysis-1') {
      return json(route, { name: '合成岗位匹配分析', analysis: analysisFixture })
    }
    if (method === 'GET' && path === '/api/analysis') {
      return json(route, historyFixture)
    }
    if (method === 'GET' && path === '/api/jd/jd-1') {
      return json(route, { id: 'jd-1', rawText: '合成岗位说明', parsed: { requirements: [LONG_REQUIREMENT] } })
    }
    if (method === 'GET' && path === '/api/resume/resume-1') {
      return json(route, { id: 'resume-1', rawText: '合成简历材料', parsed: { experience: [] } })
    }
    return json(route, { error: { code: 'E2E_API_NOT_MOCKED', message: 'API route is not allowlisted' } }, 404)
  })
}

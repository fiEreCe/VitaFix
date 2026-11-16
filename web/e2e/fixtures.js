export const LONG_REQUIREMENT = '负责从业务目标出发完成用户研究、需求拆解、方案设计、跨团队协作、数据验证与复盘沉淀，并能清晰说明每个决策所依据的用户事实、约束条件、个人行动和可验证结果；面对信息不完整的复杂项目时，能够主动澄清范围、识别风险、设计可回退的验证路径，并持续向合作团队同步进展、结论和下一步计划。'

export const LONG_FACT = '在匿名课程项目中负责设计访谈提纲、组织可用性测试、归纳反馈主题、维护需求优先级并推动两轮原型验证；每轮均记录假设、观察、个人完成的分析动作和团队确认的结论，最终输出不含姓名、联系方式、公司名称或其他个人数据的合成研究摘要，供后续方案取舍与风险复盘使用。'

export const routeCases = [
  { path: '/', slug: 'home' },
  { path: '/jd-input', slug: 'jd-input' },
  { path: '/resume-input?jdId=jd-1', slug: 'resume-input' },
  { path: '/supplement?jdId=jd-1&resumeId=resume-1', slug: 'supplement' },
  { path: '/agent/session-1', slug: 'agent' },
  { path: '/agent/session-1/summary', slug: 'agent-summary' },
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
  total: 1,
}

export const agentSessionListFixture = {
  list: [{
    id: 'session-1',
    type: 'agent',
    title: '示例组织 · 产品岗位',
    company: '示例组织',
    position: '产品岗位',
    state: 'task_in_progress',
    taskCount: 4,
    completedCount: 2,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  }],
  total: 1,
  page: 1,
  pageSize: 100,
  totalPages: 1,
}

export const agentSummaryFixture = {
  id: 'session-1',
  state: 'ready_for_reevaluation',
  title: '示例组织 · 产品岗位',
  company: '示例组织',
  position: '产品岗位',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  totals: {
    taskCount: 5,
    completedCount: 3,
    adoptedCount: 2,
    decisionPendingCount: 1,
    draftCount: 1,
    incompleteCount: 2,
  },
  tasks: [
    {
      id: 'task-1',
      requirementText: '负责用户研究并形成洞察',
      state: 'accepted',
      expressionKind: 'adopted',
      adopted: true,
      completed: true,
      decisionPending: false,
      currentText: '完成用户研究并输出关键洞察',
      candidateText: '完成用户研究并输出关键洞察',
      originalText: '设计访谈提纲并访谈 8 位用户',
      verificationStatus: 'passed',
      riskAcknowledged: false,
      risks: [],
      validation: null,
      facts: [{ id: 'fact-1', sourceText: '设计访谈提纲并访谈 8 位用户', confirmation: 'confirmed' }],
      factRefs: ['fact-1'],
    },
    {
      id: 'task-2',
      requirementText: '推动跨团队协作',
      state: 'completed_with_risk',
      expressionKind: 'adopted_with_risk',
      adopted: true,
      completed: true,
      decisionPending: false,
      currentText: '独立推动 500 人跨团队协作',
      candidateText: '独立推动 500 人跨团队协作',
      originalText: '协调设计与研发完成两轮验证',
      verificationStatus: 'blocked',
      riskAcknowledged: true,
      risks: [{ type: 'estimated_number', message: '数量缺少事实依据' }],
      validation: { safetyStatus: 'blocked', stale: false },
      facts: [{ id: 'fact-2', sourceText: '协调设计与研发完成两轮验证', confirmation: 'confirmed' }],
      factRefs: ['fact-2'],
    },
    {
      id: 'task-3',
      requirementText: '数据分析',
      state: 'user_edited',
      expressionKind: 'draft',
      adopted: false,
      completed: false,
      decisionPending: false,
      currentText: '独立完成数据分析并复盘',
      candidateText: '独立完成数据分析并复盘',
      originalText: '参与数据整理',
      verificationStatus: 'unverified_user_content',
      riskAcknowledged: false,
      risks: [],
      validation: { safetyStatus: 'passed', stale: true },
      facts: [],
      factRefs: [],
    },
    {
      id: 'task-4',
      requirementText: '项目复盘',
      state: 'awaiting_user_decision',
      expressionKind: 'candidate',
      adopted: false,
      completed: false,
      decisionPending: true,
      currentText: '',
      candidateText: '主导项目复盘并形成行动项',
      originalText: '参与复盘会议',
      verificationStatus: 'passed',
      riskAcknowledged: false,
      risks: [],
      validation: null,
      facts: [],
      factRefs: [],
    },
    {
      id: 'task-5',
      requirementText: '行业研究',
      state: 'skipped',
      expressionKind: 'none',
      adopted: false,
      completed: true,
      decisionPending: false,
      currentText: '',
      candidateText: '',
      originalText: '暂无相关经历',
      verificationStatus: 'not_applicable',
      riskAcknowledged: false,
      risks: [],
      validation: null,
      facts: [],
      factRefs: [],
    },
  ],
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

    if (method === 'GET' && path === '/api/agent-sessions/session-1/summary') {
      return json(route, agentSummaryFixture)
    }
    if (method === 'GET' && path === '/api/agent-sessions') {
      return json(route, agentSessionListFixture)
    }
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

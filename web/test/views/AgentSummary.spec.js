import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AgentSummary from '../../src/views/AgentSummary.vue'

const {
  back,
  push,
  summary,
  showToast,
  routeState,
} = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  summary: vi.fn(),
  showToast: vi.fn(),
  routeState: { params: { id: 'session-1' }, query: {} },
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ back, push }),
}))

vi.mock('../../src/api', () => ({
  agentSessionApi: { summary },
}))

vi.mock('vant', () => ({ showToast }))

const summaryFixture = {
  id: 'session-1',
  state: 'ready_for_reevaluation',
  title: '示例公司 · 产品经理',
  company: '示例公司',
  position: '产品经理',
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

function mountSummary() {
  return mount(AgentSummary, {
    global: { mocks: { $router: { back, push } } },
  })
}

describe('AgentSummary', () => {
  let writeText

  beforeEach(() => {
    back.mockReset()
    push.mockReset()
    summary.mockReset()
    showToast.mockReset()
    routeState.params.id = 'session-1'
    summary.mockResolvedValue(structuredClone(summaryFixture))
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('renders every persisted task with expression, verification, and risk state', async () => {
    const wrapper = mountSummary()
    await flushPromises()

    expect(summary).toHaveBeenCalledWith('session-1')
    expect(wrapper.findAll('.task-card')).toHaveLength(5)
    expect(wrapper.text()).toContain('已采用表达')
    expect(wrapper.text()).toContain('已采用 · 风险已确认')
    expect(wrapper.text()).toContain('草稿 · 未验证')
    expect(wrapper.text()).toContain('候选 · 待决定')
    expect(wrapper.text()).toContain('已跳过')
    expect(wrapper.text()).toContain('当前文本已再次编辑')
    expect(wrapper.text()).toContain('已由用户确认保留风险内容')
    expect(wrapper.text()).toContain('estimated_number')
    expect(wrapper.text()).toContain('数量缺少事实依据')
  })

  it('copies adopted results only, keeping risk content clearly marked', async () => {
    const wrapper = mountSummary()
    await flushPromises()

    await wrapper.get('.batch-btn--primary').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('完成用户研究并输出关键洞察')
    expect(copied).toContain('独立推动 500 人跨团队协作')
    expect(copied).toContain('风险已确认')
    expect(copied).not.toContain('独立完成数据分析并复盘')
    expect(copied).not.toContain('主导项目复盘并形成行动项')
    expect(showToast).toHaveBeenCalledWith('已复制 2 条已采用表达')
  })

  it('copies all expressions with explicit draft, candidate, and risk labels', async () => {
    const wrapper = mountSummary()
    await flushPromises()

    const allButton = wrapper.findAll('.batch-btn')
      .find((button) => button.text().includes('复制全部表达'))
    await allButton.trigger('click')
    await flushPromises()

    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('完成用户研究并输出关键洞察')
    expect(copied).toContain('独立完成数据分析并复盘')
    expect(copied).toContain('草稿 · 未验证')
    expect(copied).toContain('主导项目复盘并形成行动项')
    expect(copied).toContain('候选 · 待决定')
    expect(copied).not.toContain('暂无相关经历')
  })

  it('copies a single expression and returns to the matching task', async () => {
    const wrapper = mountSummary()
    await flushPromises()

    await wrapper.get('[aria-label="复制任务 4 的表达"]').trigger('click')
    await flushPromises()
    expect(writeText.mock.calls[0][0]).toContain('主导项目复盘并形成行动项')

    const workbenchButtons = wrapper.findAll('.workbench-btn')
    await workbenchButtons[1].trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: '/agent/session-1',
      query: { task: 'task-2' },
    })
  })

  it('renders legacy summaries with missing optional fields', async () => {
    summary.mockResolvedValue({
      id: 'session-legacy',
      state: 'completed',
      title: '旧版简历优化会话',
      totals: { taskCount: 1, completedCount: 1 },
      tasks: [{
        id: 'legacy-task',
        requirementText: '旧版岗位要求',
        state: 'accepted',
        expressionKind: 'adopted',
        adopted: true,
        completed: true,
        currentText: '旧版已采用表达',
        verificationStatus: 'unavailable',
      }],
    })

    const wrapper = mountSummary()
    await flushPromises()

    expect(wrapper.findAll('.task-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('旧版已采用表达')
    expect(wrapper.text()).toContain('暂无可用的原始事实')
    expect(wrapper.text()).toContain('暂无事实引用')
    expect(wrapper.text()).toContain('暂无额外风险提示')
  })

  it('shows a retryable error and can load again', async () => {
    summary.mockRejectedValueOnce(new Error('network unavailable'))
    const wrapper = mountSummary()
    await flushPromises()

    expect(wrapper.text()).toContain('汇总加载失败')
    expect(wrapper.text()).toContain('network unavailable')

    await wrapper.get('.status-panel__retry').trigger('click')
    await flushPromises()

    expect(summary).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.task-card')).toHaveLength(5)
  })
})

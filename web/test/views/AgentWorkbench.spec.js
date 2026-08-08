import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AgentTaskNavigation from '../../src/components/agent/AgentTaskNavigation.vue'
import AgentWorkbench from '../../src/views/AgentWorkbench.vue'

const { back, getSession, selectTask } = vi.hoisted(() => ({
  back: vi.fn(),
  getSession: vi.fn(),
  selectTask: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'session-1' } }),
}))

vi.mock('../../src/api', () => ({
  agentSessionApi: {
    get: getSession,
    selectTask,
    answer: vi.fn(),
    reviewFact: vi.fn(),
    generate: vi.fn(),
    retry: vi.fn(),
    validate: vi.fn(),
    completeWithRisk: vi.fn(),
    decide: vi.fn(),
    returnControl: vi.fn(),
  },
}))

const sessionFixture = {
  id: 'session-1',
  requirements: [{ id: 'requirement-1', sourceText: '负责用户研究并形成洞察' }],
  resumeFacts: [{
    id: 'fact-1',
    sourceText: '设计访谈提纲并访谈 8 位用户',
    confirmation: 'confirmed',
  }],
  tasks: [{
    id: 'task-1',
    requirementId: 'requirement-1',
    factIds: ['fact-1'],
    gapType: 'expression',
    recommended: true,
    state: 'verification_failed',
    candidate: {
      text: '主导用户研究并输出关键洞察',
      rationaleSummary: '基于已确认事实优化表达',
      verification: {
        status: 'blocked',
        findings: [{ type: 'unsupported_ownership' }],
      },
    },
    validationRecords: [{
      changeOutcome: 'unchanged',
      safetyStatus: 'unavailable',
      diff: { before: '参与用户访谈', after: '主导用户研究' },
      remainingIssues: [{ type: 'validation_unavailable' }],
    }],
  }],
}

describe('AgentWorkbench adaptive evidence workspace', () => {
  beforeEach(() => {
    back.mockReset()
    getSession.mockReset()
    selectTask.mockReset()
    getSession.mockResolvedValue(structuredClone(sessionFixture))
  })

  it('splits task navigation, current work, and evidence context without child API calls', async () => {
    const wrapper = mount(AgentWorkbench, {
      global: {
        mocks: { $router: { back } },
      },
    })

    await flushPromises()

    expect(wrapper.get('[aria-label="优化任务"]').exists()).toBe(true)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')
    expect(wrapper.get('[aria-label="证据与审核上下文"]').text()).toContain('系统未将该 AI 内容标记为可采用')
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getSession).toHaveBeenCalledWith('session-1')

    const navigationSource = readFileSync(resolve('src/components/agent/AgentTaskNavigation.vue'), 'utf8')
    const evidenceSource = readFileSync(resolve('src/components/agent/AgentEvidenceContext.vue'), 'utf8')

    for (const source of [navigationSource, evidenceSource]) {
      expect(source).toMatch(/defineProps/)
      expect(source).toMatch(/defineEmits/)
      expect(source).not.toMatch(/(?:from\s+['"][^'"]*api|agentSessionApi)/)
    }
  })

  it.each([
    ['capability_gap', '能力缺口'],
    ['parse_failed', '简历解析失败'],
    ['match_failed', '证据匹配失败'],
  ])('keeps the %s task state explicit instead of implying success', (state, label) => {
    const wrapper = mount(AgentTaskNavigation, {
      props: {
        tasks: [{ id: `task-${state}`, requirementId: 'requirement-1', state }],
        requirements: [{ id: 'requirement-1', sourceText: '用户研究' }],
        selectedId: `task-${state}`,
      },
    })

    const stateText = wrapper.get('.task-row__state').text()
    expect(stateText).toBe(label)
    expect(stateText).not.toMatch(/成功|通过/)
  })

  it('restores the server current task before the recommended task', async () => {
    const restoredSession = structuredClone(sessionFixture)
    restoredSession.currentTaskId = 'task-b'
    restoredSession.requirements.push({ id: 'requirement-b', sourceText: '数据分析' })
    restoredSession.tasks.push({
      id: 'task-b',
      requirementId: 'requirement-b',
      factIds: [],
      state: 'questioning',
    })
    getSession.mockResolvedValue(restoredSession)

    const wrapper = mount(AgentWorkbench, {
      global: { mocks: { $router: { back } } },
    })
    await flushPromises()

    expect(wrapper.get('[aria-current="step"]').text()).toContain('数据分析')
  })

  it('falls back to the first task when the session has no current or recommended task', async () => {
    const fallbackSession = structuredClone(sessionFixture)
    fallbackSession.tasks[0].recommended = false
    fallbackSession.requirements.push({ id: 'requirement-b', sourceText: '数据分析' })
    fallbackSession.tasks.push({
      id: 'task-b',
      requirementId: 'requirement-b',
      factIds: [],
      state: 'pending',
    })
    getSession.mockResolvedValue(fallbackSession)

    const wrapper = mount(AgentWorkbench, {
      global: { mocks: { $router: { back } } },
    })
    await flushPromises()

    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')
    expect(wrapper.get('[aria-label="当前优化任务"]').exists()).toBe(true)
  })

  it('serializes pending task selection and disables every task until reload completes', async () => {
    let resolveSelection
    const pendingSelection = new Promise((resolve) => {
      resolveSelection = resolve
    })
    const pendingSession = {
      id: 'session-1',
      requirements: [
        { id: 'requirement-a', sourceText: '用户研究' },
        { id: 'requirement-b', sourceText: '数据分析' },
      ],
      resumeFacts: [],
      tasks: [
        { id: 'task-a', requirementId: 'requirement-a', factIds: [], recommended: true, state: 'pending' },
        { id: 'task-b', requirementId: 'requirement-b', factIds: [], state: 'pending' },
      ],
    }
    getSession.mockImplementation(() => Promise.resolve(structuredClone(pendingSession)))
    selectTask.mockReturnValue(pendingSelection)

    const wrapper = mount(AgentWorkbench, {
      global: { mocks: { $router: { back } } },
    })
    await flushPromises()

    let taskRows = wrapper.findAll('.task-row')
    await taskRows[1].trigger('click')
    await taskRows[0].trigger('click')
    await taskRows[1].trigger('click')

    expect(selectTask).toHaveBeenCalledTimes(1)
    expect(selectTask).toHaveBeenCalledWith('session-1', 'task-b')
    expect(wrapper.findAll('.task-row').every((row) => row.attributes('disabled') !== undefined)).toBe(true)

    resolveSelection()
    await flushPromises()

    taskRows = wrapper.findAll('.task-row')
    expect(getSession).toHaveBeenCalledTimes(2)
    expect(taskRows.every((row) => row.attributes('disabled') === undefined)).toBe(true)
  })
})

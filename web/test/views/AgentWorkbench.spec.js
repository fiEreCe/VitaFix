import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AgentTaskNavigation from '../../src/components/agent/AgentTaskNavigation.vue'
import AgentWorkbench from '../../src/views/AgentWorkbench.vue'
import {
  readAgentRecovery,
  saveAgentRecovery,
} from '../../src/utils/agentRecovery.js'

const {
  back,
  replace,
  getSession,
  startSession,
  selectTask,
  decide,
  route,
} = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  getSession: vi.fn(),
  startSession: vi.fn(),
  selectTask: vi.fn(),
  decide: vi.fn(),
  route: { params: { id: 'session-1' }, query: {} },
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const state = reactive(route)
  return {
    useRoute: () => state,
    useRouter: () => ({ back, replace, push: vi.fn() }),
    __route: state,
  }
})

vi.mock('../../src/api', () => ({
  agentSessionApi: {
    get: getSession,
    start: startSession,
    selectTask,
    answer: vi.fn(),
    reviewFact: vi.fn(),
    generate: vi.fn(),
    retry: vi.fn(),
    validate: vi.fn(),
    completeWithRisk: vi.fn(),
    decide,
    returnControl: vi.fn(),
  },
}))

import { __route } from 'vue-router'

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

const draftSession = {
  id: 'session-1',
  state: 'draft',
  jdId: 'jd-1',
  resumeId: 'resume-1',
  requirements: [],
  resumeFacts: [],
  tasks: [],
}

const parsingSession = {
  ...draftSession,
  state: 'parsing',
  analysisClaimExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
}

const readySession = {
  ...structuredClone(sessionFixture),
  state: 'evidence_ready',
}

enableAutoUnmount(afterEach)

function mountWorkbench() {
  return mount(AgentWorkbench, {
    global: {
      mocks: { $router: { back } },
    },
  })
}

function retryButton(wrapper) {
  return wrapper.get('.status-panel__retry')
}

describe('AgentWorkbench adaptive evidence workspace', () => {
  beforeEach(() => {
    back.mockReset()
    replace.mockReset()
    getSession.mockReset()
    startSession.mockReset()
    selectTask.mockReset()
    decide.mockReset()
    localStorage.clear()
    __route.params.id = 'session-1'
    getSession.mockResolvedValue(structuredClone(sessionFixture))
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('splits task navigation, current work, and evidence context without child API calls', async () => {
    const wrapper = mountWorkbench()

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

    const wrapper = mountWorkbench()
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

    const wrapper = mountWorkbench()
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

    const wrapper = mountWorkbench()
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

  it('auto-starts a draft session once and polls until the tasks are ready', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession
      .mockResolvedValueOnce(structuredClone(draftSession))
      .mockResolvedValueOnce(structuredClone(readySession))
    startSession.mockResolvedValue(structuredClone(parsingSession))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith('session-1')
    expect(wrapper.text()).toContain('正在解析岗位与简历')

    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(getSession).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')

    wrapper.unmount()
  })

  it('keeps the same session id after a start failure and retries that session', async () => {
    getSession.mockResolvedValue(structuredClone(draftSession))
    startSession
      .mockRejectedValueOnce(new Error('网络连接中断'))
      .mockResolvedValueOnce(structuredClone(readySession))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(startSession).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('分析启动失败')
    expect(wrapper.text()).toContain('同一个会话')

    await retryButton(wrapper).trigger('click')
    await flushPromises()

    expect(startSession).toHaveBeenCalledTimes(2)
    expect(startSession.mock.calls[1][0]).toBe('session-1')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')

    wrapper.unmount()
  })

  it('keeps waiting when the start response is lost but the server is already parsing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession
      .mockResolvedValueOnce(structuredClone(draftSession))
      .mockResolvedValueOnce(structuredClone(parsingSession))
      .mockResolvedValueOnce(structuredClone(readySession))
    startSession.mockRejectedValue(new Error('响应丢失'))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(wrapper.text()).toContain('正在解析岗位与简历')
    expect(wrapper.text()).not.toContain('分析启动失败')

    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')

    wrapper.unmount()
  })

  it.each([
    ['parsing_failed', '岗位或简历解析失败'],
    ['matching_failed', '证据匹配失败'],
  ])('offers a retry for the same session when state is %s', async (state, title) => {
    getSession.mockResolvedValue({
      ...structuredClone(draftSession),
      state,
    })
    startSession.mockResolvedValue(structuredClone(readySession))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(wrapper.text()).toContain(title)
    await retryButton(wrapper).trigger('click')
    await flushPromises()

    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith('session-1')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')

    wrapper.unmount()
  })

  it('shows a clear not-found state and clears only the matching recovery record', async () => {
    const error = Object.assign(new Error('会话不存在或无权访问'), {
      code: 'AGENT_SESSION_NOT_FOUND',
      status: 404,
    })
    getSession.mockRejectedValue(error)
    saveAgentRecovery({ id: 'session-1', jdId: 'jd-1', resumeId: 'resume-1' })

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(wrapper.text()).toContain('会话不存在或已过期')
    expect(readAgentRecovery()).toBeNull()

    await retryButton(wrapper).trigger('click')

    expect(replace).toHaveBeenCalledWith({
      path: '/supplement',
      query: {
        jdId: 'jd-1',
        resumeId: 'resume-1',
        skip: '1',
        fresh: '1',
      },
    })

    wrapper.unmount()
  })

  it('explains capability_gap and lets the user skip that task', async () => {
    getSession.mockResolvedValue({
      id: 'session-1',
      state: 'task_in_progress',
      requirements: [{ id: 'requirement-1', sourceText: '具备数据分析能力' }],
      resumeFacts: [],
      tasks: [{
        id: 'task-1',
        requirementId: 'requirement-1',
        factIds: [],
        gapType: 'capability',
        recommended: true,
        state: 'capability_gap',
      }],
    })
    decide.mockResolvedValue({})

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(wrapper.text()).toContain('当前经历缺少这项证据')
    const skip = wrapper.findAll('van-button').find((button) => button.text().includes('跳过这个任务'))
    expect(skip).toBeTruthy()

    await skip.trigger('click')
    await flushPromises()

    expect(decide).toHaveBeenCalledWith('session-1', 'task-1', { type: 'skipped' })

    wrapper.unmount()
  })

  it('keeps waiting on an active lease without starting a competing request', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession.mockResolvedValue(structuredClone(parsingSession))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(startSession).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(getSession).toHaveBeenCalledTimes(2)
    expect(startSession).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('asks the server to recover an expired lease through the same session', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession.mockResolvedValue({
      ...structuredClone(parsingSession),
      analysisClaimExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    startSession.mockResolvedValue(structuredClone(readySession))

    const wrapper = mountWorkbench()
    await flushPromises()

    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith('session-1')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('用户研究')

    wrapper.unmount()
  })

  it('bounds polling failures and surfaces a retry instead of requesting forever', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession
      .mockResolvedValueOnce(structuredClone(parsingSession))
      .mockRejectedValue(new Error('网络不可用'))

    const wrapper = mountWorkbench()
    await flushPromises()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
    }

    expect(wrapper.text()).toContain('暂时无法加载会话')
    expect(getSession).toHaveBeenCalledTimes(6)

    wrapper.unmount()
  })

  it('ignores a late response from the previous session after switching sessions', async () => {
    let resolveFirst
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const secondSession = {
      id: 'session-2',
      state: 'evidence_ready',
      requirements: [{ id: 'requirement-2', sourceText: '新会话的岗位要求' }],
      resumeFacts: [],
      tasks: [{
        id: 'task-2',
        requirementId: 'requirement-2',
        factIds: [],
        state: 'pending',
      }],
    }
    getSession.mockImplementation((id) => (
      id === 'session-1' ? firstResponse : Promise.resolve(secondSession)
    ))

    const wrapper = mountWorkbench()
    await flushPromises()

    __route.params.id = 'session-2'
    await flushPromises()

    expect(wrapper.text()).toContain('新会话的岗位要求')

    resolveFirst(structuredClone(sessionFixture))
    await flushPromises()

    expect(wrapper.text()).toContain('新会话的岗位要求')
    expect(wrapper.text()).not.toContain('负责用户研究并形成洞察')

    wrapper.unmount()
  })

  it('stops polling after the page is unmounted', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    getSession.mockResolvedValue(structuredClone(parsingSession))

    const wrapper = mountWorkbench()
    await flushPromises()
    expect(getSession).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10000)

    expect(getSession).toHaveBeenCalledTimes(1)
  })
})

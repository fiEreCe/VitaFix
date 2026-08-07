import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AgentWorkbench from '../../src/views/AgentWorkbench.vue'

const { back, getSession } = vi.hoisted(() => ({
  back: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'session-1' } }),
}))

vi.mock('../../src/api', () => ({
  agentSessionApi: {
    get: getSession,
    selectTask: vi.fn(),
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
})

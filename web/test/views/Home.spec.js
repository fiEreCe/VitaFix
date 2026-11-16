import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Home from '../../src/views/Home.vue'

const { push, list, agentList } = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn().mockResolvedValue({
    list: [{
      id: 'history-1',
      name: '前端工程师匹配分析',
      company: '示例公司',
      position: '前端工程师',
      createdAt: '2026-08-08T00:00:00.000Z',
      score: 86,
      grade: 'A',
    }],
    total: 1,
  }),
  agentList: vi.fn().mockResolvedValue({
    list: [{
      id: 'session-1',
      type: 'agent',
      title: '示例公司 · 产品经理',
      company: '示例公司',
      position: '产品经理',
      state: 'task_in_progress',
      taskCount: 2,
      completedCount: 1,
      updatedAt: '2026-08-09T00:00:00.000Z',
    }],
    total: 1,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  RouterLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}))

vi.mock('../../src/api', () => ({
  historyApi: { list },
  agentSessionApi: { list: agentList },
}))

describe('Home', () => {
  beforeEach(() => {
    push.mockReset()
    list.mockClear()
    agentList.mockClear()
    list.mockResolvedValue({
      list: [{
        id: 'history-1',
        name: '前端工程师匹配分析',
        company: '示例公司',
        position: '前端工程师',
        createdAt: '2026-08-08T00:00:00.000Z',
        score: 86,
        grade: 'A',
      }],
      total: 1,
    })
    agentList.mockResolvedValue({
      list: [{
        id: 'session-1',
        type: 'agent',
        title: '示例公司 · 产品经理',
        company: '示例公司',
        position: '产品经理',
        state: 'task_in_progress',
        taskCount: 2,
        completedCount: 1,
        updatedAt: '2026-08-09T00:00:00.000Z',
      }],
      total: 1,
    })
  })

  it('presents the evidence-driven, fact-safe workflow with two explicit entrances', async () => {
    const wrapper = mount(Home)
    await flushPromises()

    expect(wrapper.text()).toContain('证据驱动')
    expect(wrapper.text()).toContain('事实安全')
    expect(wrapper.findAll('button').length).toBeGreaterThanOrEqual(2)

    const primary = wrapper.get('button[data-entry="analysis"]')
    const demo = wrapper.get('button[data-entry="demo"]')
    expect(primary.text()).toContain('开始新分析')
    expect(demo.text()).toContain('查看引导演示')

    await primary.trigger('click')
    expect(push).toHaveBeenCalledWith('/jd-input')

    await demo.trigger('click')
    expect(push).toHaveBeenCalledWith('/demo')
    expect(wrapper.get('[aria-label="核心闭环"] ol').findAll('li')).toHaveLength(3)

    const historyLink = wrapper.get('a.history-card[href="/result/history-1"]')
    expect(historyLink.text()).toContain('前端工程师匹配分析')
  })

  it('shows recent Agent sessions with state and task progress and links to the workbench', async () => {
    const wrapper = mount(Home)
    await flushPromises()

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 5 })
    expect(agentList).toHaveBeenCalledWith({ page: 1, pageSize: 5 })

    const agentLink = wrapper.get('a.history-card[href="/agent/session-1"]')
    expect(agentLink.text()).toContain('优化会话')
    expect(agentLink.text()).toContain('示例公司 · 产品经理')
    expect(agentLink.text()).toContain('处理中')
    expect(agentLink.text()).toContain('已完成 1/2 项')

    const links = wrapper.findAll('a.history-card')
    expect(links).toHaveLength(2)
    // updatedAt desc: agent session first
    expect(links[0].attributes('href')).toBe('/agent/session-1')
  })

  it('defaults missing Agent progress fields and offers retry after a load error', async () => {
    agentList.mockResolvedValueOnce({
      list: [{ id: 'session-2', type: 'agent', state: 'draft' }],
      total: 1,
    })
    const wrapper = mount(Home)
    await flushPromises()

    const agentLink = wrapper.get('a.history-card[href="/agent/session-2"]')
    expect(agentLink.text()).toContain('草稿')
    expect(agentLink.text()).toContain('暂无任务')
    expect(agentLink.text()).toContain('简历优化会话')

    agentList.mockRejectedValueOnce(new Error('network unavailable'))
    const retryWrapper = mount(Home)
    await flushPromises()

    expect(retryWrapper.text()).toContain('历史记录加载失败')
    expect(retryWrapper.text()).toContain('network unavailable')

    agentList.mockResolvedValueOnce({ list: [], total: 0 })
    list.mockResolvedValueOnce({ list: [], total: 0 })
    await retryWrapper.get('.status-panel__retry').trigger('click')
    await flushPromises()

    expect(retryWrapper.text()).toContain('还没有分析或优化记录')
  })
})

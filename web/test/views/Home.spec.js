import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Home from '../../src/views/Home.vue'

const { push, list } = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn().mockResolvedValue({ list: [] }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('../../src/api', () => ({
  historyApi: { list },
}))

describe('Home', () => {
  beforeEach(() => {
    push.mockReset()
    list.mockClear()
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
  })
})

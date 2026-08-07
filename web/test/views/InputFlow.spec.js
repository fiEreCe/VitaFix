import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResumeInput from '../../src/views/ResumeInput.vue'

const { push, replace, back } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { jdId: 'jd-1' } }),
  useRouter: () => ({ push, replace, back }),
}))

vi.mock('../../src/api', () => ({
  jdApi: {
    create: vi.fn(),
    ocr: vi.fn(),
  },
  resumeApi: {
    create: vi.fn(),
    upload: vi.fn(),
  },
  supplementApi: {
    upsert: vi.fn(),
  },
  agentSessionApi: {
    create: vi.fn(),
    start: vi.fn(),
  },
}))

describe('input flow semantics', () => {
  beforeEach(() => {
    push.mockReset()
    replace.mockReset()
    back.mockReset()
  })

  it('exposes resume input methods as an accessible two-tab selector', async () => {
    const wrapper = mount(ResumeInput)
    const tabs = wrapper.findAll('[role="tab"]')

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('输入方式')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].element.tagName).toBe('BUTTON')
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('aria-selected')).toBe('false')

    await tabs[1].trigger('click')
    expect(tabs[0].attributes('aria-selected')).toBe('false')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.get('label[for="resume-file"]')).toBeTruthy()
    expect(wrapper.get('#resume-file').attributes('accept')).toBe('.pdf,.docx,.doc,.txt')
  })

  it('uses a named button contract for deleting a supplemental experience', () => {
    const source = readFileSync(resolve('src/views/Supplement.vue'), 'utf8')

    expect(source).toMatch(/<button[\s\S]*?:aria-label="`删除经历：\$\{item\.title\}`"[\s\S]*?@click="removeItem\(idx\)"/)
    expect(source).toMatch(/<van-icon\s+name="cross"\s+aria-hidden="true"/)
  })
})

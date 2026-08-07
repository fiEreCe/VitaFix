import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import JdInput from '../../src/views/JdInput.vue'
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

  async function expectRovingTabs(Component, prefix) {
    const wrapper = mount(Component, { attachTo: document.body })
    const tabs = wrapper.findAll('[role="tab"]')

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('输入方式')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].element.tagName).toBe('BUTTON')
    expect(tabs[0].attributes('id')).toBe(`${prefix}-tab-0`)
    expect(tabs[0].attributes('aria-controls')).toBe(`${prefix}-panel-0`)
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('aria-selected')).toBe('false')
    expect(tabs[1].attributes('tabindex')).toBe('-1')

    const firstPanel = wrapper.get('[role="tabpanel"]')
    expect(firstPanel.attributes('id')).toBe(`${prefix}-panel-0`)
    expect(firstPanel.attributes('aria-labelledby')).toBe(`${prefix}-tab-0`)

    tabs[0].element.focus()
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(tabs[1].element)
    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(`${prefix}-tab-1`)

    await tabs[1].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[0].element)
    await tabs[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(tabs[1].element)
    await tabs[1].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(tabs[0].element)
    await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[1].element)

    wrapper.unmount()
  }

  it('implements roving keyboard focus for JD input methods', async () => {
    await expectRovingTabs(JdInput, 'jd-method')
  })

  it('implements roving keyboard focus for resume input methods', async () => {
    await expectRovingTabs(ResumeInput, 'resume-method')
  })

  it('keeps the native resume file input as the only focusable upload control', async () => {
    const wrapper = mount(ResumeInput)
    const tabs = wrapper.findAll('[role="tab"]')

    await tabs[1].trigger('click')
    const dropZone = wrapper.get('label[for="resume-file"]')
    const input = wrapper.get('#resume-file')

    expect(dropZone.attributes('role')).toBeUndefined()
    expect(dropZone.attributes('tabindex')).toBeUndefined()
    expect(input.attributes('accept')).toBe('.pdf,.docx,.doc,.txt')
    expect(input.attributes('disabled')).toBeUndefined()

    wrapper.vm.uploading = true
    await nextTick()
    expect(input.attributes('disabled')).toBeDefined()

    const source = readFileSync(resolve('src/views/ResumeInput.vue'), 'utf8')
    expect(source).not.toMatch(/<label[\s\S]*?@keydown/)
    expect(source).toMatch(/<input[\s\S]*?:disabled="uploading"/)
    expect(source).toMatch(/\.drop-zone:focus-within/)
  })

  it('uses a named button contract for deleting a supplemental experience', () => {
    const source = readFileSync(resolve('src/views/Supplement.vue'), 'utf8')

    expect(source).toMatch(/<button[\s\S]*?:aria-label="`删除经历：\$\{item\.title\}`"[\s\S]*?@click="removeItem\(idx\)"/)
    expect(source).toMatch(/<van-icon\s+name="cross"\s+aria-hidden="true"/)
  })
})

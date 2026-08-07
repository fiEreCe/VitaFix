import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StatusPanel from '../../src/components/ui/StatusPanel.vue'

const source = readFileSync(resolve('src/components/ui/StatusPanel.vue'), 'utf8')

describe('StatusPanel', () => {
  it('announces errors and emits retry from retryable errors', async () => {
    const wrapper = mount(StatusPanel, {
      props: {
        kind: 'error',
        title: '加载失败',
        retryable: true,
      },
    })

    expect(wrapper.attributes('role')).toBe('alert')

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('announces loading state politely', () => {
    const wrapper = mount(StatusPanel, {
      props: {
        kind: 'loading',
        title: '正在加载',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('uses the empty modifier when kind is omitted', () => {
    const wrapper = mount(StatusPanel, {
      props: {
        title: '暂无内容',
      },
    })

    expect(wrapper.classes()).toContain('status-panel--empty')
  })

  it('uses the approved panel radius and retry dimensions', () => {
    expect(source).toMatch(/kind:\s*\{[^}]*default:\s*'empty'/s)
    expect(source).toMatch(/\.status-panel\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s)
    expect(source).toMatch(/\.status-panel__retry\s*\{[^}]*margin-top:\s*1rem[^}]*min-height:\s*2\.75rem[^}]*padding:\s*0 1\.25rem/s)
  })
})

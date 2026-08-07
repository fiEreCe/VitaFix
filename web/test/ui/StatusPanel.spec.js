import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StatusPanel from '../../src/components/ui/StatusPanel.vue'

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
})

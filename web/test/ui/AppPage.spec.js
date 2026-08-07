import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppPage from '../../src/components/ui/AppPage.vue'

describe('AppPage', () => {
  it('labels the page and emits back from the accessible back control', async () => {
    const wrapper = mount(AppPage, {
      props: {
        title: '输入简历',
        back: true,
        description: '第二步',
      },
    })

    expect(wrapper.get('main').attributes('aria-labelledby')).toBe('page-title')
    expect(wrapper.get('#page-title').text()).toBe('输入简历')

    const backButton = wrapper.get('[aria-label="返回上一页"]')
    await backButton.trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})

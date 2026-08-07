import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppPage from '../../src/components/ui/AppPage.vue'

const source = readFileSync(resolve('src/components/ui/AppPage.vue'), 'utf8')

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

  it('does not reserve a spacer when the back control is absent', () => {
    const wrapper = mount(AppPage, {
      props: {
        title: '输入简历',
        back: false,
      },
    })

    expect(wrapper.find('.app-chrome__spacer').exists()).toBe(false)
  })

  it('uses the approved adaptive chrome values without hard separators or viewport overrides', () => {
    expect(source).not.toMatch(/border-bottom/)
    expect(source).not.toMatch(/\.app-page\s*\{[^}]*min-height:\s*100%/s)
    expect(source).toMatch(/grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/)
    expect(source).toMatch(/\.icon-button\s*\{[^}]*border:\s*0[^}]*background:\s*var\(--surface-subtle\)[^}]*font-size:\s*1\.75rem[^}]*line-height:\s*1/s)
    expect(source).toMatch(/\.app-chrome__title h1\s*\{[^}]*font-size:\s*var\(--type-headline\)/s)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import GuidedDemo from '../../src/views/GuidedDemo.vue'

const source = readFileSync(resolve('src/views/GuidedDemo.vue'), 'utf8')

const mountDemo = () => mount(GuidedDemo, {
  global: {
    mocks: {
      $router: {
        back: vi.fn(),
        push: vi.fn(),
      },
    },
  },
})

describe('GuidedDemo', () => {
  it('announces the initial job requirement and the next resume fact', async () => {
    const wrapper = mountDemo()
    const progress = wrapper.get('[aria-label="演示进度"]')
    const detail = wrapper.get('[aria-live="polite"]')
    const liveElement = detail.element

    expect(progress.element.tagName).toBe('OL')
    expect(detail.attributes('aria-atomic')).toBe('true')
    expect(detail.text()).toContain('岗位要求')
    expect(detail.text()).toContain('产品岗位：具备用户研究与需求分析能力')

    await wrapper.get('[data-testid="demo-next"]').trigger('click')

    const updatedDetail = wrapper.get('[aria-live="polite"]')
    expect(updatedDetail.element).toBe(liveElement)
    expect(updatedDetail.attributes('aria-atomic')).toBe('true')
    expect(updatedDetail.text()).toContain('简历事实')
    expect(updatedDetail.text()).toContain('参与校园产品用户访谈并整理反馈')
  })

  it('shows every title as ordered progress with active and completed emphasis', async () => {
    const wrapper = mountDemo()
    const items = wrapper.get('[aria-label="演示进度"]').findAll('li')

    expect(items).toHaveLength(6)
    expect(items.map((item) => item.findAll('span')[1].text())).toEqual([
      '岗位要求',
      '简历事实',
      '识别缺口',
      '事实确认',
      '安全候选',
      '修改效果验证',
    ])
    expect(items[0].attributes('aria-current')).toBe('step')
    expect(items[0].classes()).toContain('is-active')

    await wrapper.get('[data-testid="demo-next"]').trigger('click')

    expect(items[0].classes()).toContain('is-complete')
    expect(items[0].attributes('aria-current')).toBeUndefined()
    expect(items[1].classes()).toContain('is-active')
    expect(items[1].attributes('aria-current')).toBe('step')
  })

  it('restarts the walkthrough at the first detail', async () => {
    const wrapper = mountDemo()

    for (let index = 0; index < 5; index += 1) {
      await wrapper.get('[data-testid="demo-next"]').trigger('click')
    }
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('修改效果验证')

    await wrapper.get('button[data-testid="demo-restart"]').trigger('click')

    expect(wrapper.get('[aria-live="polite"]').text()).toContain('岗位要求')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('岗位要求')
  })

  it('uses AppPage, mobile-first flow, reviewed desktop columns, and restrained reveal motion', () => {
    expect(source).toMatch(/<AppPage[\s\S]*?back[\s\S]*?@back="\$router\.back\(\)"/)
    expect(source).toMatch(/\.demo-layout\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
    expect(source).toMatch(/@media\s*\(min-width:\s*56\.25rem\)[\s\S]*?\.demo-layout\s*\{[^}]*grid-template-columns:\s*minmax\(16rem,\s*22rem\)\s+minmax\(0,\s*1fr\)/s)
    expect(source).toMatch(/@media\s*\(min-width:\s*56\.25rem\)[\s\S]*?\.demo-progress\s*\{[^}]*position:\s*sticky[^}]*top:\s*6\.5rem/s)
    expect(source).toMatch(/\.demo-detail\s*\{[^}]*animation:[^;}]*var\(--motion-reveal\)[^;}]*var\(--ease-out-fluid\)/s)
    expect(source).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.demo-detail\s*\{[^}]*animation:\s*none[^}]*transform:\s*none/s)
  })
})

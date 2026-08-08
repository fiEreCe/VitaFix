import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AnalysisResult from '../../src/views/AnalysisResult.vue'
import History from '../../src/views/History.vue'
import DimensionCard from '../../src/components/DimensionCard.vue'
import RadarChart from '../../src/components/RadarChart.vue'
import SectionAnalysis from '../../src/components/SectionAnalysis.vue'

const fixture = {
  overallScore: 82,
  overallGrade: '良好',
  summary: '核心能力与岗位较匹配。',
  dimensions: [
    { name: '技能匹配', score: 80, detail: '技能覆盖充分' },
    { name: '经验匹配', score: 70, detail: '经验基本匹配' },
    { name: '教育背景', score: 90, detail: '教育背景匹配' },
  ],
  requirementChecklist: [],
  sectionAnalysis: [],
}

const historyItem = {
  id: 'analysis-1',
  name: '高级产品经理匹配分析',
  company: '示例公司',
  position: '高级产品经理',
  createdAt: '2026-08-08T00:00:00.000Z',
  score: 82,
  grade: '良好',
}

const {
  back,
  push,
  getStatus,
  getById,
  list,
  updateName,
  analysisCompleted,
  historyRenamed,
  routerState,
} = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  getStatus: vi.fn(),
  getById: vi.fn(),
  list: vi.fn(),
  updateName: vi.fn(),
  analysisCompleted: vi.fn(),
  historyRenamed: vi.fn(),
  routerState: { route: null },
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  routerState.route ||= reactive({ params: { id: 'analysis-1' } })
  return {
    useRoute: () => routerState.route,
    useRouter: () => ({ back, push }),
  }
})

vi.mock('../../src/api', () => ({
  analysisApi: {
    getStatus,
    getById,
    reevaluateSection: vi.fn(),
  },
  historyApi: {
    list,
    updateName,
    remove: vi.fn(),
  },
}))

vi.mock('../../src/utils/analytics', () => ({
  events: {
    analysisCompleted,
    historyRenamed,
    historyDeleted: vi.fn(),
  },
}))

vi.mock('vant', () => ({
  showToast: vi.fn(),
  showConfirmDialog: vi.fn(() => Promise.resolve()),
}))

describe('result and history workspaces', () => {
  beforeEach(() => {
    back.mockReset()
    push.mockReset()
    getStatus.mockReset().mockResolvedValue({ status: 'completed' })
    getById.mockReset().mockResolvedValue({ analysis: fixture, name: '高级产品经理匹配分析' })
    list.mockReset().mockResolvedValue({ list: [historyItem] })
    updateName.mockReset().mockResolvedValue({})
    historyRenamed.mockReset()
    analysisCompleted.mockReset()
    routerState.route.params.id = 'analysis-1'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('labels the completed result overview and details', async () => {
    const result = mount(AnalysisResult, {
      global: { mocks: { $router: { back, push } } },
    })
    await flushPromises()

    expect(result.find('[aria-label="分析概览"]').exists()).toBe(true)
    expect(result.find('[aria-label="分析详情"]').exists()).toBe(true)
    result.unmount()
  })

  it('provides a text alternative for the radar chart', () => {
    const radar = mount(RadarChart, { props: { dimensions: fixture.dimensions } })

    expect(radar.get('[role="img"]').attributes('aria-label')).toContain('技能匹配 80 分')
  })

  it('clamps a negative radar score to zero in both geometry and summary', () => {
    const radar = mount(RadarChart, {
      props: {
        dimensions: [
          { name: '技能匹配', score: -20 },
          { name: '经验匹配', score: 50 },
          { name: '教育背景', score: 50 },
        ],
      },
    })

    const dataPolygon = radar.findAll('polygon')[4]
    const firstPoint = dataPolygon.attributes('points').split(' ')[0]
    expect(firstPoint).toBe('140,140')
    expect(radar.get('[role="img"]').attributes('aria-label')).toContain('技能匹配 0 分')
  })

  it('uses a button with expanded state for a dimension header', () => {
    const dimension = mount(DimensionCard, { props: { dimension: fixture.dimensions[0] } })

    expect(dimension.get('button').attributes('aria-expanded')).toBe('false')
  })

  it('gives each destructive history action a record-specific label', async () => {
    const history = mount(History, {
      global: { mocks: { $router: { back, push } } },
    })
    await flushPromises()

    const deleteButtons = history.findAll('button[aria-label^="删除分析"]')
    expect(deleteButtons.length).toBe(1)
    expect(deleteButtons[0].attributes('aria-label')).toContain(historyItem.name)
  })

  it('renames a history record once when the dialog confirms', async () => {
    const history = mount(History, {
      global: {
        mocks: { $router: { back, push } },
        stubs: {
          'van-dialog': {
            props: ['show', 'beforeClose'],
            emits: ['confirm'],
            methods: {
              async confirm() {
                this.$emit('confirm')
                await this.beforeClose('confirm')
              },
            },
            template: '<div v-if="show"><button data-dialog-confirm type="button" @click="confirm">确认</button><slot /></div>',
          },
        },
      },
    })
    await flushPromises()

    await history.get('button[aria-label^="重命名分析"]').trigger('click')
    await history.get('[data-dialog-confirm]').trigger('click')
    await flushPromises()

    expect(updateName).toHaveBeenCalledTimes(1)
    expect(updateName).toHaveBeenCalledWith(historyItem.id, historyItem.name)
    expect(historyRenamed).toHaveBeenCalledTimes(1)
  })

  it('keeps the rename dialog open when updating the name fails', async () => {
    updateName.mockRejectedValueOnce(new Error('network unavailable'))
    const history = mount(History, {
      global: {
        mocks: { $router: { back, push } },
        stubs: {
          'van-dialog': {
            props: ['show', 'beforeClose'],
            template: '<div v-if="show" data-dialog><slot /></div>',
          },
        },
      },
    })
    await flushPromises()

    await history.get('button[aria-label^="重命名分析"]').trigger('click')
    const shouldClose = await history.vm.handleEditClose('confirm')

    expect(shouldClose).toBe(false)
    expect(history.find('[data-dialog]').exists()).toBe(true)
    expect(history.vm.editName).toBe(historyItem.name)
  })

  it('owns one polling timer across retry and clears it on unmount', async () => {
    vi.useFakeTimers()
    getStatus.mockReset().mockResolvedValue({ status: 'processing' })
    const result = mount(AnalysisResult, {
      global: { mocks: { $router: { back, push } } },
    })
    await flushPromises()
    expect(getStatus).toHaveBeenCalledTimes(1)

    await result.vm.retry()
    await flushPromises()
    expect(getStatus).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(getStatus).toHaveBeenCalledTimes(3)
    expect(getById).not.toHaveBeenCalled()
    expect(analysisCompleted).not.toHaveBeenCalled()

    result.unmount()
    await vi.advanceTimersByTimeAsync(4000)
    expect(getStatus).toHaveBeenCalledTimes(3)
    expect(getById).not.toHaveBeenCalled()
    expect(analysisCompleted).not.toHaveBeenCalled()
  })

  it('starts polling a changed route and ignores completion from the old route', async () => {
    vi.useFakeTimers()
    let resolveOldStatus
    const oldStatus = new Promise((resolve) => {
      resolveOldStatus = resolve
    })
    getStatus.mockReset().mockImplementation((id) => (
      id === 'analysis-a' ? oldStatus : Promise.resolve({ status: 'processing' })
    ))
    routerState.route.params.id = 'analysis-a'

    const result = mount(AnalysisResult, {
      global: { mocks: { $router: { back, push } } },
    })
    await flushPromises()
    expect(getStatus).toHaveBeenCalledWith('analysis-a')

    routerState.route.params.id = 'analysis-b'
    await flushPromises()
    expect(getStatus).toHaveBeenCalledWith('analysis-b')

    resolveOldStatus({ status: 'completed' })
    await flushPromises()
    expect(getById).not.toHaveBeenCalledWith('analysis-a')
    expect(analysisCompleted).not.toHaveBeenCalled()

    result.unmount()
  })

  it('renders a legacy section suggestion only once', () => {
    const section = mount(SectionAnalysis, {
      props: {
        section: {
          sectionType: 'experience',
          sectionIndex: 0,
          label: '项目经历',
          matchScore: 65,
          matchedRequirements: ['跨团队协作'],
          suggestions: ['补充个人行动与结果'],
        },
      },
    })

    expect(section.findAll('.suggestion-item').filter((item) =>
      item.text() === '补充个人行动与结果'
    )).toHaveLength(1)
  })
})

import { mount, flushPromises } from '@vue/test-utils'
import { vi, it, expect } from 'vitest'
import History from '../../src/views/History.vue'
const mocks = vi.hoisted(() => ({ analysisRemove:vi.fn(),agentRemove:vi.fn(),confirm:vi.fn(),toast:vi.fn() }))
vi.mock('vue-router',()=>({useRouter:()=>({push:vi.fn(),back:vi.fn()})}))
vi.mock('vant',()=>({showToast:mocks.toast,showConfirmDialog:mocks.confirm}))
vi.mock('../../src/api',()=>({historyApi:{list:async()=>({list:[{id:'same',name:'test'}]}),remove:mocks.analysisRemove},agentSessionApi:{list:async()=>({list:[{id:'same',title:'session',state:'draft',tasks:[]}]}),remove:mocks.agentRemove}}))
vi.mock('../../src/utils/analytics',()=>({events:{historyDeleted:vi.fn()}}))
it('deletes agent via its own endpoint and preserves analysis with identical ID',async()=>{
 mocks.confirm.mockResolvedValue();mocks.agentRemove.mockResolvedValue({deleted:true})
 const wrapper=mount(History);await flushPromises()
 expect(wrapper.findAll('.card-delete')).toHaveLength(2)
 await wrapper.findAll('.card-delete')[0].trigger('click');await flushPromises()
 const calledAgent=mocks.agentRemove.mock.calls.length===1
 expect(calledAgent || mocks.analysisRemove.mock.calls.length===1).toBe(true)
 expect(wrapper.findAll('.history-card')).toHaveLength(1)
 await wrapper.find('.card-delete').trigger('click');await flushPromises()
 expect(mocks.agentRemove).toHaveBeenCalledWith('same')
 expect(mocks.analysisRemove).toHaveBeenCalledWith('same')
 expect(mocks.confirm.mock.calls[0][0].message).toContain('共享材料')
})
it('keeps the list unchanged when deletion fails and allows retry',async()=>{
 mocks.confirm.mockResolvedValue()
 mocks.agentRemove.mockRejectedValueOnce(new Error('retry'))
 mocks.analysisRemove.mockRejectedValueOnce(new Error('retry'))
 const wrapper=mount(History);await flushPromises()
 await wrapper.find('.card-delete').trigger('click');await flushPromises()
 expect(wrapper.findAll('.history-card')).toHaveLength(2)
 expect(mocks.toast).toHaveBeenLastCalledWith(expect.stringContaining('retry'))
})

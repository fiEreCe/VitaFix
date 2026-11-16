import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearAgentRecovery,
  findAgentRecovery,
  readAgentRecovery,
  saveAgentRecovery,
} from '../../src/utils/agentRecovery.js'

describe('agent recovery storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and reads the pending session for the current device', () => {
    saveAgentRecovery({ id: 'session-1', jdId: 'jd-1', resumeId: 'resume-1' })

    expect(readAgentRecovery()).toMatchObject({
      id: 'session-1',
      jdId: 'jd-1',
      resumeId: 'resume-1',
    })
  })

  it('only matches the same JD and resume pair', () => {
    saveAgentRecovery({ id: 'session-1', jdId: 'jd-1', resumeId: 'resume-1' })

    expect(findAgentRecovery({ jdId: 'jd-1', resumeId: 'resume-1' })?.id).toBe('session-1')
    expect(findAgentRecovery({ jdId: 'jd-1', resumeId: 'resume-2' })).toBeNull()
    expect(findAgentRecovery({ jdId: 'jd-2', resumeId: 'resume-1' })).toBeNull()
  })

  it('does not clear a record that belongs to another session', () => {
    saveAgentRecovery({ id: 'session-1', jdId: 'jd-1', resumeId: 'resume-1' })

    clearAgentRecovery('session-other')
    expect(readAgentRecovery()?.id).toBe('session-1')

    clearAgentRecovery('session-1')
    expect(readAgentRecovery()).toBeNull()
  })

  it('is scoped to the current device', () => {
    saveAgentRecovery({ id: 'session-1', jdId: 'jd-1', resumeId: 'resume-1' })
    localStorage.setItem('jingzhu_device_id', 'user_other_device')

    expect(readAgentRecovery()).toBeNull()
  })

  it('ignores malformed stored values', () => {
    localStorage.setItem('jingzhu_device_id', 'user_test')
    localStorage.setItem('jingzhu_agent_pending_session:user_test', '{not json')

    expect(readAgentRecovery()).toBeNull()
  })
})

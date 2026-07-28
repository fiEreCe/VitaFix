function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export const demoFixture = deepFreeze({
  version: 'pf004-2',
  isDemo: true,
  evaluationVersion: {
    ruleVersion: 'pf002-rules-2',
    schemaVersion: 'pf002-schema-2',
    promptVersion: 'pf003-validation-prompt-1',
    codeVersion: 'fixture-pf004-2',
  },
  session: {
    state: 'ready_for_reevaluation',
    requirements: [{
      id: 'demo-req-1',
      sourceText: '产品岗位：具备用户研究与需求分析能力',
      priority: 1,
    }],
    resumeFacts: [{
      id: 'demo-fact-1',
      sourceText: '参与校园产品用户访谈并整理反馈',
      action: '设计访谈提纲并整理反馈',
      context: '校园产品用户研究',
      contribution: '负责访谈提纲设计与反馈整理',
      confirmation: 'confirmed',
    }],
    tasks: [{
      id: 'demo-task-1',
      requirementId: 'demo-req-1',
      factIds: ['demo-fact-1'],
      gapType: 'expression',
      state: 'ready_for_reevaluation',
      candidate: {
        text: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
        factRefs: ['demo-fact-1'],
        contentSource: 'ai_generated',
        verification: {
          status: 'passed',
          findings: [],
          supportedClaims: ['参与校园产品用户访谈', '设计访谈提纲并整理反馈'],
          unsupportedClaims: [],
          factRefs: ['demo-fact-1'],
        },
      },
      validationRecords: [{
        id: 'demo-validation-1',
        baselineText: '参与用户访谈',
        currentText: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
        diff: {
          before: '参与用户访谈',
          after: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
          changed: true,
        },
        changeOutcome: 'improved',
        safetyStatus: 'passed',
        evidenceCoverage: {
          before: 1,
          after: 1,
        },
        improvements: ['补充了访谈场景和个人贡献'],
        remainingIssues: [],
        nextActions: ['可采用当前文本'],
        evaluationVersion: {
          ruleVersion: 'pf002-rules-2',
          schemaVersion: 'pf002-schema-2',
          promptVersion: 'pf003-validation-prompt-1',
          codeVersion: 'fixture-pf004-2',
        },
        createdAt: '2026-07-28T00:00:00.000Z',
      }],
    }],
  },
})

/**
 * Agent 会话历史与多任务最终结果汇总。
 *
 * 汇总完全由已持久化的 session.tasks / requirements / resumeFacts 计算，
 * 不额外调用 AI，也不再维护一份容易失去同步的结果副本。
 */

const COMPLETED_TASK_STATES = new Set([
  'accepted',
  'ready_for_reevaluation',
  'completed_with_risk',
  'rejected',
  'skipped',
  'capability_gap',
]);

const ADOPTED_TASK_STATES = new Set([
  'accepted',
  'ready_for_reevaluation',
  'completed_with_risk',
]);

const PENDING_DECISION_STATES = new Set(['awaiting_user_decision']);
const NO_EXPRESSION_STATES = new Set(['rejected', 'skipped', 'capability_gap']);
const UNAVAILABLE_CANDIDATE_STATES = new Set(['generation_failed', 'verification_failed']);

function valueId(value) {
  if (!value) return '';
  if (typeof value.id === 'string' && value.id) return value.id;
  if (value._id) return String(value._id);
  return '';
}

function sessionTitle(jd, createdAt) {
  const parsed = jd && typeof jd === 'object' && !Array.isArray(jd) ? jd.parsed || {} : {};
  const position = typeof parsed.position === 'string' ? parsed.position.trim() : '';
  const company = typeof parsed.company === 'string' ? parsed.company.trim() : '';
  if (position && company) return `${company} · ${position}`;
  if (position) return position;
  if (company) return company;

  const date = createdAt ? new Date(createdAt) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `简历优化会话 ${safe.toISOString().slice(0, 10)}`;
}

function uniqueIds(...groups) {
  const values = [];
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((id) => {
      if (typeof id === 'string' && id && !values.includes(id)) values.push(id);
    });
  });
  return values;
}

function normalizeFindings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { type: item, message: '' };
      return {
        type: typeof item?.type === 'string' && item.type ? item.type : 'risk',
        message: typeof item?.message === 'string' ? item.message : '',
      };
    })
    .filter((item) => item.type);
}

function mergeRisks(...groups) {
  const seen = new Set();
  const risks = [];
  groups.forEach((group) => {
    normalizeFindings(group).forEach((item) => {
      const key = `${item.type}|${item.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      risks.push(item);
    });
  });
  return risks;
}

/**
 * 当前表达以用户的实际操作为准：
 * - 再次编辑后 task.currentText 是最新的用户文本；
 * - 旧版会话缺少 currentText 时，从验证记录 / 候选表达回退；
 * - 尚未采用的候选只作为 candidateText 暴露，不会混入已采用表达。
 */
function resolveCurrentText(task) {
  // 拒绝 / 跳过 / 能力缺口没有“当前采用表达”，历史编辑文本只保留为候选记录。
  if (NO_EXPRESSION_STATES.has(task.state)) return '';

  const currentText = typeof task.currentText === 'string' ? task.currentText : '';
  if (currentText) return currentText;

  const candidateText = typeof task.candidate?.text === 'string' ? task.candidate.text : '';
  const latest = latestValidation(task);
  const latestText = typeof latest?.currentText === 'string' ? latest.currentText : '';

  if (task.state === 'accepted') return candidateText || latestText;
  if (task.state === 'ready_for_reevaluation' || task.state === 'completed_with_risk') {
    return latestText || candidateText;
  }
  if (task.state === 'user_edited') return candidateText || latestText;
  return '';
}

function latestValidation(task) {
  const records = Array.isArray(task.validationRecords) ? task.validationRecords : [];
  return records.length ? records[records.length - 1] : null;
}

function expressionKind(task, currentText, candidateText) {
  if (task.state === 'accepted' || task.state === 'ready_for_reevaluation') {
    return currentText ? 'adopted' : 'none';
  }
  if (task.state === 'completed_with_risk') {
    return currentText ? 'adopted_with_risk' : 'none';
  }
  if (task.state === 'user_edited') {
    return currentText ? 'draft' : 'none';
  }
  if (NO_EXPRESSION_STATES.has(task.state)) return 'none';
  if (candidateText) {
    return UNAVAILABLE_CANDIDATE_STATES.has(task.state)
      ? 'candidate_unverified'
      : 'candidate';
  }
  return 'none';
}

function resolveVerificationStatus(task, currentText, latest) {
  const candidateStatus = task.candidate?.verification?.status;

  if (['rejected', 'skipped', 'capability_gap'].includes(task.state)) {
    return 'not_applicable';
  }
  if (task.state === 'completed_with_risk') return 'blocked';

  if (task.state === 'user_edited') {
    // 只有“为当前文本记录的一次验证”才能把草稿展示为可用结果。
    if (
      latest
      && currentText
      && latest.currentText === currentText
      && latest.safetyStatus === 'unavailable'
    ) {
      return 'unavailable';
    }
    return 'unverified_user_content';
  }

  if (task.state === 'accepted') {
    return candidateStatus || latest?.safetyStatus || 'unavailable';
  }

  if (task.state === 'ready_for_reevaluation') {
    if (latest) {
      // 旧验证记录对应的不是当前文本，不能据此宣称新文本已验证。
      if (currentText && latest.currentText === currentText) {
        return latest.safetyStatus || 'unavailable';
      }
      return 'unverified_user_content';
    }
    return candidateStatus || 'unavailable';
  }

  if (candidateStatus) return candidateStatus;
  if (latest?.safetyStatus) return latest.safetyStatus;
  return 'not_generated';
}

function buildValidation(latest, currentText) {
  if (!latest) return null;
  return {
    safetyStatus: latest.safetyStatus || '',
    changeOutcome: latest.changeOutcome || '',
    baselineText: typeof latest.baselineText === 'string' ? latest.baselineText : '',
    currentText: typeof latest.currentText === 'string' ? latest.currentText : '',
    stale: Boolean(currentText) && latest.currentText !== currentText,
    diff: latest.diff || null,
    improvements: Array.isArray(latest.improvements) ? latest.improvements : [],
    remainingIssues: normalizeFindings(latest.remainingIssues),
    nextActions: Array.isArray(latest.nextActions) ? latest.nextActions : [],
    createdAt: latest.createdAt || null,
  };
}

function buildTaskSummary(session, task) {
  const factsById = new Map(
    (Array.isArray(session.resumeFacts) ? session.resumeFacts : [])
      .filter((fact) => fact && typeof fact.id === 'string')
      .map((fact) => [fact.id, fact]),
  );
  const candidateFactRefs = Array.isArray(task.candidate?.factRefs) ? task.candidate.factRefs : [];
  const taskFactIds = Array.isArray(task.factIds) ? task.factIds : [];
  const factIds = uniqueIds(taskFactIds, candidateFactRefs);
  const facts = factIds
    .map((id) => factsById.get(id))
    .filter(Boolean)
    .map((fact) => {
      const confirmation = fact.confirmation || '';
      // 旧会话没有 confirmationSource：只标记为“历史记录”，不冒充用户已确认。
      const confirmationSource = fact.confirmationSource
        || (['confirmed', 'corrected'].includes(confirmation) ? 'legacy' : '');
      return {
        id: fact.id,
        sourceText: typeof fact.sourceText === 'string' ? fact.sourceText : '',
        confirmation,
        confirmationSource,
      };
    });

  const sourceText = facts
    .map((fact) => fact.sourceText)
    .filter(Boolean)
    .join('\n');
  const originalText = typeof task.initialText === 'string' && task.initialText
    ? task.initialText
    : sourceText;

  const candidateText = typeof task.candidate?.text === 'string' ? task.candidate.text : '';
  const currentText = resolveCurrentText(task);
  const latest = latestValidation(task);
  const kind = expressionKind(task, currentText, candidateText);
  const verificationStatus = resolveVerificationStatus(task, currentText, latest);
  const completed = COMPLETED_TASK_STATES.has(task.state);
  const adopted = ADOPTED_TASK_STATES.has(task.state);
  const decisionPending = PENDING_DECISION_STATES.has(task.state);

  const requirement = (Array.isArray(session.requirements) ? session.requirements : [])
    .find((item) => item?.id === task.requirementId);

  const validationTextMatches = Boolean(latest && currentText && latest.currentText === currentText);
  const risks = mergeRisks(
    validationTextMatches ? latest.remainingIssues : [],
    task.candidate?.verification?.findings,
  );

  return {
    id: task.id,
    requirementId: task.requirementId || '',
    requirementText: typeof requirement?.sourceText === 'string' && requirement.sourceText
      ? requirement.sourceText
      : '岗位要求',
    state: task.state || 'pending',
    gapType: task.gapType || '',
    priority: Number.isFinite(task.priority) ? task.priority : 0,
    recommended: Boolean(task.recommended),
    effectiveRounds: Number.isFinite(task.effectiveRounds) ? task.effectiveRounds : 0,
    originalText,
    currentText,
    candidateText,
    expressionKind: kind,
    adopted,
    completed,
    decisionPending,
    verificationStatus,
    // completed_with_risk 本身即代表用户完成过风险确认，兼容缺少该字段的旧会话。
    riskAcknowledged: task.state === 'completed_with_risk' || Boolean(task.riskAcknowledged),
    risks,
    validation: buildValidation(latest, currentText),
    factRefs: uniqueIds(candidateFactRefs, taskFactIds),
    facts,
    hasUsableExpression: Boolean(currentText || candidateText || originalText),
  };
}

function countTotals(taskSummaries) {
  return {
    taskCount: taskSummaries.length,
    completedCount: taskSummaries.filter((item) => item.completed).length,
    adoptedCount: taskSummaries.filter((item) => item.adopted).length,
    decisionPendingCount: taskSummaries.filter((item) => item.decisionPending).length,
    draftCount: taskSummaries.filter((item) => item.expressionKind === 'draft').length,
    incompleteCount: taskSummaries.filter((item) => !item.completed).length,
  };
}

function buildSessionSummary(session, { jd = null } = {}) {
  const document = session || {};
  const tasks = Array.isArray(document.tasks) ? document.tasks : [];
  const taskSummaries = tasks.map((task) => buildTaskSummary(document, task || {}));
  const totals = countTotals(taskSummaries);
  const jdValue = jd
    || (document.jdId && typeof document.jdId === 'object' ? document.jdId : null);
  const parsed = jdValue?.parsed || {};

  return {
    id: valueId(document),
    state: document.state || 'draft',
    title: sessionTitle(jdValue, document.createdAt),
    position: typeof parsed.position === 'string' ? parsed.position : '',
    company: typeof parsed.company === 'string' ? parsed.company : '',
    createdAt: document.createdAt || null,
    updatedAt: document.updatedAt || document.createdAt || null,
    handoff: document.handoff || null,
    taskCount: totals.taskCount,
    completedCount: totals.completedCount,
    totals,
    tasks: taskSummaries,
  };
}

function buildSessionListItem(record) {
  const document = record || {};
  const tasks = Array.isArray(document.tasks) ? document.tasks : [];
  const jdValue = document.jdId && typeof document.jdId === 'object' ? document.jdId : null;
  const parsed = jdValue?.parsed || {};
  const completedCount = tasks.filter((task) => COMPLETED_TASK_STATES.has(task?.state)).length;

  return {
    id: valueId(document),
    entityType: 'agent_session',
    type: 'agent',
    title: sessionTitle(jdValue, document.createdAt),
    position: typeof parsed.position === 'string' ? parsed.position : '',
    company: typeof parsed.company === 'string' ? parsed.company : '',
    state: document.state || 'draft',
    createdAt: document.createdAt || null,
    updatedAt: document.updatedAt || document.createdAt || null,
    taskCount: tasks.length,
    completedCount,
    progress: {
      completed: completedCount,
      total: tasks.length,
    },
  };
}

module.exports = {
  COMPLETED_TASK_STATES,
  ADOPTED_TASK_STATES,
  buildSessionSummary,
  buildSessionListItem,
  buildTaskSummary,
  sessionTitle,
  resolveCurrentText,
  resolveVerificationStatus,
};

const { evaluateCandidate } = require('./pf002Evaluator');

// Kept separate from generation so an audit can be independently replaced by a model judge later.
class AgentAuditService {
  async verifyRevision({ candidate, facts }) { return evaluateCandidate(candidate, facts); }
}

module.exports = new AgentAuditService();

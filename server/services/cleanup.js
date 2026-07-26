/**
 * Deletes expired analysis data without crossing ownership boundaries.
 */
const Analysis = require('../models/Analysis');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');

function createCleanupService({
  Analysis: AnalysisRepository,
  JD: JDRepository,
  Resume: ResumeRepository,
  Supplement: SupplementRepository,
  now = () => new Date(),
  logger = console,
} = {}) {
  return async function cleanupOldData() {
    const summary = { analyses: 0, jd: 0, resumes: 0, supplements: 0 };
    try {
      const cutoff = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000);
      logger.log(`[清理] 开始清理 ${cutoff.toISOString()} 之前的数据...`);
      const oldAnalyses = await AnalysisRepository.find({
        createdAt: { $lt: cutoff },
        status: { $in: ['completed', 'failed'] },
      });
      if (oldAnalyses.length === 0) {
        logger.log('[清理] 没有需要清理的过期数据');
        return summary;
      }

      for (const analysis of oldAnalyses) {
        const ownerFilter = { userId: analysis.userId };
        const jdRefs = await AnalysisRepository.countDocuments({
          _id: { $ne: analysis._id },
          jdId: analysis.jdId,
        });
        if (jdRefs === 0) {
          const deleted = await JDRepository.deleteOne({ _id: analysis.jdId, ...ownerFilter });
          if (deleted.deletedCount === 1) summary.jd += 1;
        }

        const resumeRefs = await AnalysisRepository.countDocuments({
          _id: { $ne: analysis._id },
          resumeId: analysis.resumeId,
        });
        if (resumeRefs === 0) {
          const deleted = await ResumeRepository.deleteOne({ _id: analysis.resumeId, ...ownerFilter });
          if (deleted.deletedCount === 1) summary.resumes += 1;
        }

        if (analysis.supplementId) {
          const supplementRefs = await AnalysisRepository.countDocuments({
            _id: { $ne: analysis._id },
            supplementId: analysis.supplementId,
          });
          if (supplementRefs === 0) {
            const deleted = await SupplementRepository.deleteOne({
              _id: analysis.supplementId,
              ...ownerFilter,
            });
            if (deleted.deletedCount === 1) summary.supplements += 1;
          }
        }

        const deleted = await AnalysisRepository.deleteOne({
          _id: analysis._id,
          ...ownerFilter,
        });
        if (deleted.deletedCount === 1) summary.analyses += 1;
      }

      logger.log(
        `[清理] 完成: 删除了 ${summary.analyses} 条分析记录, `
        + `${summary.jd} 个 JD, ${summary.resumes} 份简历, ${summary.supplements} 条补充信息`,
      );
      return summary;
    } catch (error) {
      logger.error('[清理] 执行失败:', error.message);
      return summary;
    }
  };
}

const cleanupOldData = createCleanupService({
  Analysis,
  JD,
  Resume,
  Supplement,
});

module.exports = cleanupOldData;
module.exports.createCleanupService = createCleanupService;

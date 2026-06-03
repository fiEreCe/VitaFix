/**
 * 数据清理服务
 *
 * 定期清理 7 天前的过期分析记录及其关联数据。
 * 启动时执行一次，之后每天执行一次。
 *
 * 隐私保障：用户数据留存不超过 7 天。
 */
const Analysis = require('../models/Analysis');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');

async function cleanupOldData() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    console.log(`[清理] 开始清理 ${cutoff.toISOString()} 之前的数据...`);

    // 查找所有超过 7 天的已完成的或失败的分析记录
    const oldAnalyses = await Analysis.find({
      createdAt: { $lt: cutoff },
      status: { $in: ['completed', 'failed'] },
    });

    if (oldAnalyses.length === 0) {
      console.log('[清理] 没有需要清理的过期数据');
      return;
    }

    let deletedJD = 0;
    let deletedResume = 0;
    let deletedSupplement = 0;

    for (const a of oldAnalyses) {
      // 删除关联的 JD（仅当没有其他 analysis 引用它）
      const otherRefs = await Analysis.countDocuments({
        _id: { $ne: a._id },
        jdId: a.jdId,
      });
      if (otherRefs === 0) {
        await JD.deleteOne({ _id: a.jdId });
        deletedJD++;
      }

      // 删除关联的简历
      const otherResumeRefs = await Analysis.countDocuments({
        _id: { $ne: a._id },
        resumeId: a.resumeId,
      });
      if (otherResumeRefs === 0) {
        await Resume.deleteOne({ _id: a.resumeId });
        deletedResume++;
      }

      // 删除关联的补充经历
      if (a.supplementId) {
        await Supplement.deleteOne({ _id: a.supplementId });
        deletedSupplement++;
      }

      // 删除分析记录本身
      await Analysis.deleteOne({ _id: a._id });
    }

    console.log(
      `[清理] 完成: 删除了 ${oldAnalyses.length} 条分析记录, ` +
      `${deletedJD} 个 JD, ${deletedResume} 份简历, ${deletedSupplement} 条补充信息`
    );
  } catch (error) {
    console.error('[清理] 执行失败:', error.message);
  }
}

module.exports = cleanupOldData;

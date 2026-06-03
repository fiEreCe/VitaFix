const Analysis = require('../models/Analysis');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const matchAnalyzer = require('../services/matchAnalyzer');
const sectionReevaluator = require('../services/sectionReevaluator');

/**
 * 发起分析
 * 1. 接收 jdId + resumeId
 * 2. 获取JD和简历数据
 * 3. 调用AI进行匹配分析
 * 4. 保存结果
 */
exports.create = async (req, res) => {
  try {
    const { jdId, resumeId, name } = req.body;
    if (!jdId || !resumeId) {
      return res.status(400).json({ error: 'jdId和resumeId不能为空' });
    }

    // 获取JD和简历
    const [jd, resume] = await Promise.all([
      JD.findById(jdId),
      Resume.findById(resumeId),
    ]);

    if (!jd) return res.status(404).json({ error: 'JD不存在' });
    if (!resume) return res.status(404).json({ error: '简历不存在' });

    // 创建分析记录（状态：处理中）
    const analysis = new Analysis({
      userId: req.userId,
      name: name || `投递${jd.parsed.company || ''}${jd.parsed.position || ''}`,
      jdId,
      resumeId,
      status: 'processing',
    });
    await analysis.save();

    // 获取补充信息
    const supplement = await Supplement.findOne({ resumeId });

    // 异步执行AI分析
    setImmediate(async () => {
      const startTime = Date.now();
      try {
        const result = await matchAnalyzer.analyze(
          jd.parsed,
          resume.parsed,
          supplement?.items || []
        );

        analysis.analysis = result;
        analysis.status = 'completed';
        await analysis.save();
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[分析] 完成 ${analysis._id}，耗时 ${elapsed}s，分数 ${result.overallScore}`);
      } catch (error) {
        analysis.status = 'failed';
        analysis.errorMessage = error.message;
        await analysis.save();
        console.error(`[分析] 失败 ${analysis._id}: ${error.message}`);
      }
    });

    // 立即返回，前端轮询结果
    res.status(202).json({
      id: analysis._id,
      name: analysis.name,
      status: 'processing',
      message: '分析已启动，请稍候查看结果',
    });
  } catch (error) {
    console.error('发起分析失败:', error);
    res.status(500).json({ error: '发起分析失败: ' + error.message });
  }
};

/**
 * 获取分析结果
 */
exports.getById = async (req, res) => {
  try {
    const analysis = await Analysis.findById(req.params.id)
      .populate('jdId', 'rawText parsed')
      .populate('resumeId', 'rawText parsed');

    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 获取分析状态
 */
exports.getStatus = async (req, res) => {
  try {
    const analysis = await Analysis.findById(req.params.id, 'status errorMessage');
    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }
    res.json({ status: analysis.status, errorMessage: analysis.errorMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 单板块重评估 - 用户修改简历某段后重新评分
 */
exports.reevaluateSection = async (req, res) => {
  try {
    const { sectionType, sectionIndex, revisedText } = req.body;
    if (!sectionType || sectionIndex === undefined || !revisedText) {
      return res.status(400).json({ error: 'sectionType、sectionIndex、revisedText 不能为空' });
    }

    const analysis = await Analysis.findById(req.params.id)
      .populate('jdId', 'parsed');

    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }

    // 找到对应的板块
    const sections = analysis.analysis?.sectionAnalysis || [];
    const originalSection = sections.find(
      (s) => s.sectionType === sectionType && s.sectionIndex === sectionIndex
    );

    if (!originalSection) {
      return res.status(404).json({ error: '未找到对应板块' });
    }

    // 调用 AI 重评估
    const updated = await sectionReevaluator.reevaluate(
      analysis.jdId.parsed,
      originalSection.toObject ? originalSection.toObject() : originalSection,
      revisedText
    );

    // 更新该板块数据
    originalSection.matchScore = updated.matchScore;
    originalSection.comparisons = updated.comparisons;
    originalSection['通用优势'] = updated['通用优势'];
    originalSection['通用差距'] = updated['通用差距'];
    originalSection['垂直优势'] = updated['垂直优势'];
    originalSection['垂直差距'] = updated['垂直差距'];
    originalSection.suggestions = updated.suggestions;

    // 保存整个文档
    analysis.markModified('analysis.sectionAnalysis');
    await analysis.save();

    res.json({
      matchScore: updated.matchScore,
      comparisons: updated.comparisons,
      '通用优势': updated['通用优势'],
      '通用差距': updated['通用差距'],
      '垂直优势': updated['垂直优势'],
      '垂直差距': updated['垂直差距'],
      suggestions: updated.suggestions,
    });
  } catch (error) {
    console.error('板块重评估失败:', error);
    res.status(500).json({ error: '板块重评估失败: ' + error.message });
  }
};

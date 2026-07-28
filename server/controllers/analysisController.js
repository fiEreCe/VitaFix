const Analysis = require('../models/Analysis');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const matchAnalyzer = require('../services/matchAnalyzer');
const sectionReevaluator = require('../services/sectionReevaluator');
const { publicError, sendError } = require('../utils/appError');

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
      return sendError(res, publicError('ANALYSIS_INPUT_REQUIRED', 'jdId 和 resumeId 不能为空'));
    }

    // 获取JD和简历
    const [jd, resume] = await Promise.all([
      JD.findOne({ _id: jdId, userId: req.userId }),
      Resume.findOne({ _id: resumeId, userId: req.userId }),
    ]);

    if (!jd) return sendError(res, publicError('JD_NOT_FOUND', 'JD 不存在或无权访问', { status: 404 }));
    if (!resume) return sendError(res, publicError('RESUME_NOT_FOUND', '简历不存在或无权访问', { status: 404 }));

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
    const supplement = await Supplement.findOne({ resumeId, userId: req.userId });

    // 异步执行AI分析
    const ownerId = req.userId;
    setImmediate(async () => {
      const startTime = Date.now();
      try {
        const result = await matchAnalyzer.analyze(
          jd.parsed,
          resume.parsed,
          supplement?.items || []
        );

        const write = await Analysis.updateOne(
          { _id: analysis._id, userId: ownerId },
          {
            $set: {
              analysis: result,
              status: 'completed',
              errorMessage: '',
              updatedAt: new Date(),
            },
          },
          { runValidators: true },
        );
        if (write.matchedCount === 0) return;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[分析] 完成 ${analysis._id}，耗时 ${elapsed}s，分数 ${result.overallScore}`);
      } catch (error) {
        const write = await Analysis.updateOne(
          { _id: analysis._id, userId: ownerId },
          {
            $set: {
              status: 'failed',
              errorMessage: error.message,
              updatedAt: new Date(),
            },
          },
          { runValidators: true },
        );
        if (write.matchedCount === 0) return;
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
    sendError(res, error);
  }
};

/**
 * 获取分析结果
 */
exports.getById = async (req, res) => {
  try {
    const analysis = await Analysis.findOne({ _id: req.params.id, userId: req.userId })
      .populate({ path: 'jdId', select: 'rawText parsed', match: { userId: req.userId } })
      .populate({ path: 'resumeId', select: 'rawText parsed', match: { userId: req.userId } });

    if (!analysis) {
      return sendError(res, publicError('ANALYSIS_NOT_FOUND', '分析记录不存在或无权访问', { status: 404 }));
    }

    res.json(analysis);
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * 获取分析状态
 */
exports.getStatus = async (req, res) => {
  try {
    const analysis = await Analysis.findOne({ _id: req.params.id, userId: req.userId }, 'status errorMessage');
    if (!analysis) {
      return sendError(res, publicError('ANALYSIS_NOT_FOUND', '分析记录不存在或无权访问', { status: 404 }));
    }
    res.json({ status: analysis.status, errorMessage: analysis.errorMessage });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * 单板块重评估 - 用户修改简历某段后重新评分
 */
exports.reevaluateSection = async (req, res) => {
  try {
    const { sectionType, sectionIndex, revisedText } = req.body;
    if (!sectionType || sectionIndex === undefined || !revisedText) {
      return sendError(res, publicError(
        'REEVALUATION_INPUT_REQUIRED',
        'sectionType、sectionIndex、revisedText 不能为空',
      ));
    }

    const analysis = await Analysis.findOne({ _id: req.params.id, userId: req.userId })
      .populate({ path: 'jdId', select: 'parsed', match: { userId: req.userId } });

    if (!analysis || !analysis.jdId) {
      return sendError(res, publicError('ANALYSIS_NOT_FOUND', '分析记录不存在或无权访问', { status: 404 }));
    }

    // 找到对应的板块
    const sections = analysis.analysis?.sectionAnalysis || [];
    const originalSection = sections.find(
      (s) => s.sectionType === sectionType && s.sectionIndex === sectionIndex
    );

    if (!originalSection) {
      return sendError(res, publicError('SECTION_NOT_FOUND', '未找到对应板块', { status: 404 }));
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

    // 以当前所有者为条件保存整个板块，避免读取后所有权变化导致越权写入
    analysis.markModified('analysis.sectionAnalysis');
    const write = await Analysis.updateOne(
      { _id: analysis._id, userId: req.userId },
      {
        $set: {
          'analysis.sectionAnalysis': analysis.analysis.sectionAnalysis,
          updatedAt: new Date(),
        },
      },
      { runValidators: true },
    );
    if (write.matchedCount === 0) {
      return sendError(res, publicError('ANALYSIS_NOT_FOUND', '分析记录不存在或无权访问', { status: 404 }));
    }

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
    sendError(res, error);
  }
};

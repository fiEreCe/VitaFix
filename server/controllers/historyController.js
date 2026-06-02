const Analysis = require('../models/Analysis');

/**
 * 获取当前用户的历史分析记录列表
 */
exports.list = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, sort = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const sortOrder = sort === 'asc' ? 1 : -1;

    const query = { userId: req.userId, status: 'completed' };

    const [records, total] = await Promise.all([
      Analysis.find(query, 'name jdId analysis.overallScore analysis.overallGrade createdAt')
        .populate('jdId', 'parsed.company parsed.position')
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Analysis.countDocuments(query),
    ]);

    // 格式化返回
    const list = records.map((r) => ({
      id: r._id,
      name: r.name,
      company: r.jdId?.parsed?.company || '',
      position: r.jdId?.parsed?.position || '',
      score: r.analysis?.overallScore || 0,
      grade: r.analysis?.overallGrade || '',
      createdAt: r.createdAt,
    }));

    res.json({
      list,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 修改分析记录名称（仅限自己的记录）
 */
exports.updateName = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '名称不能为空' });
    }

    const analysis = await Analysis.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { name: name.trim() },
      { new: true }
    );

    if (!analysis) {
      return res.status(404).json({ error: '记录不存在或无权操作' });
    }

    res.json({ id: analysis._id, name: analysis.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 删除分析记录（仅限自己的记录）
 */
exports.remove = async (req, res) => {
  try {
    const analysis = await Analysis.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!analysis) {
      return res.status(404).json({ error: '记录不存在或无权操作' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const Supplement = require('../models/Supplement');

exports.upsert = async (req, res) => {
  try {
    const { resumeId, items } = req.body;
    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId不能为空' });
    }

    let supplement = await Supplement.findOne({ resumeId });
    if (supplement) {
      supplement.items = items || [];
      supplement.updatedAt = new Date();
    } else {
      supplement = new Supplement({ resumeId, items: items || [] });
    }
    await supplement.save();

    res.json({ id: supplement._id, items: supplement.items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getByResumeId = async (req, res) => {
  try {
    const supplement = await Supplement.findOne({ resumeId: req.params.resumeId });
    if (!supplement) {
      return res.json({ items: [] });
    }
    res.json(supplement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const Supplement = require('../models/Supplement');
const Resume = require('../models/Resume');

function createSupplementController({
  Supplement: SupplementRepository = Supplement,
  Resume: ResumeRepository = Resume,
} = {}) {
  return {
    async upsert(req, res) {
      try {
        const { resumeId, items } = req.body;
        if (!resumeId) return res.status(400).json({ error: 'resumeId不能为空' });

        const ownedResume = await ResumeRepository.exists({ _id: resumeId, userId: req.userId });
        if (!ownedResume) return res.status(404).json({ error: '简历不存在' });

        const filter = { userId: req.userId, resumeId };
        const now = new Date();
        const update = {
          $set: { items: items || [], updatedAt: now },
          $setOnInsert: { userId: req.userId, resumeId, createdAt: now },
        };
        let supplement;
        try {
          supplement = await SupplementRepository.findOneAndUpdate(
            filter,
            update,
            { upsert: true, new: true, runValidators: true },
          );
        } catch (error) {
          if (error?.code !== 11000) throw error;
          supplement = await SupplementRepository.findOneAndUpdate(
            filter,
            { $set: update.$set },
            { new: true, runValidators: true },
          );
        }
        if (!supplement) return res.status(404).json({ error: '补充信息不存在' });
        return res.json({ id: supplement._id, items: supplement.items });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    },

    async getByResumeId(req, res) {
      try {
        const supplement = await SupplementRepository.findOne({
          resumeId: req.params.resumeId,
          userId: req.userId,
        });
        if (!supplement) return res.json({ items: [] });
        return res.json(supplement);
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    },
  };
}

module.exports = {
  createSupplementController,
  ...createSupplementController(),
};

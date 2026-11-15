const test = require('node:test');
const assert = require('node:assert/strict');

const Resume = require('../models/Resume');
const resumeParser = require('../services/resumeParser');
const fileParser = require('../services/fileParser');
const controller = require('../controllers/resumeController');
const { publicError } = require('../utils/appError');

function createRes(requestId = 'resume_test_123') {
  return {
    locals: { requestId },
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createReq({
  originalname = 'resume.txt',
  buffer = Buffer.from('张三\n前端开发工程师', 'utf8'),
  requestId = 'resume_test_123',
} = {}) {
  return {
    file: { originalname, buffer, size: buffer.length },
    userId: 'test-user',
    requestId,
  };
}

test('empty TXT returns 400 with a clear code and requestId', async () => {
  const res = createRes();
  await controller.upload(createReq({ buffer: Buffer.alloc(0) }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'RESUME_TEXT_EMPTY');
  assert.equal(res.body.error.requestId, 'resume_test_123');
});

test('.doc is rejected as an unsupported format', async () => {
  const res = createRes();
  await controller.upload(createReq({ originalname: 'resume.doc' }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'RESUME_FILE_TYPE_UNSUPPORTED');
  assert.equal(res.body.error.requestId, 'resume_test_123');
});

test('text endpoint rejects whitespace-only input with 400', async () => {
  const res = createRes();
  await controller.create({ body: { rawText: '   ' }, userId: 'test-user' }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'RESUME_TEXT_REQUIRED');
});

test('text endpoint maps AI failure to a retryable 503', async (t) => {
  const originalParse = resumeParser.parse;
  resumeParser.parse = async () => {
    throw new Error('AI 返回结果解析失败，请重试');
  };
  t.after(() => {
    resumeParser.parse = originalParse;
  });

  const res = createRes();
  await controller.create({ body: { rawText: '张三 前端开发工程师' }, userId: 'test-user' }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RESUME_AI_UNAVAILABLE');
  assert.equal(res.body.error.retryable, true);
});

test('text endpoint still returns 201 on a valid parse', async (t) => {
  const originalParse = resumeParser.parse;
  const originalSave = Resume.prototype.save;
  let saveCalls = 0;

  resumeParser.parse = async () => ({
    personalInfo: { name: '张三' },
    education: [],
    experience: [],
    projects: [],
    skills: ['Vue'],
    certifications: [],
  });
  Resume.prototype.save = async function saveStub() {
    saveCalls += 1;
    return this;
  };
  t.after(() => {
    resumeParser.parse = originalParse;
    Resume.prototype.save = originalSave;
  });

  const res = createRes();
  await controller.create({ body: { rawText: '张三 前端开发工程师' }, userId: 'test-user' }, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.id);
  assert.equal(saveCalls, 1);
  assert.equal(res.body.parsed.personalInfo.name, '张三');
});

test('AI failure is a retryable 503, not a generic 500', async (t) => {
  const originalParse = resumeParser.parse;
  resumeParser.parse = async () => {
    throw new Error('AI 返回结果解析失败，请重试');
  };
  t.after(() => {
    resumeParser.parse = originalParse;
  });

  const res = createRes();
  await controller.upload(createReq(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RESUME_AI_UNAVAILABLE');
  assert.equal(res.body.error.retryable, true);
  assert.equal(res.body.error.requestId, 'resume_test_123');
});

test('an unexpected parser failure remains a 500', async (t) => {
  const originalExtract = fileParser.extractText;
  fileParser.extractText = async () => {
    throw new Error('unexpected parser crash');
  };
  t.after(() => {
    fileParser.extractText = originalExtract;
  });

  const res = createRes();
  await controller.upload(createReq(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.equal(res.body.error.requestId, 'resume_test_123');
});

test('upload preserves an AppError from the resume parser', async (t) => {
  const originalParse = resumeParser.parse;
  resumeParser.parse = async () => {
    throw publicError('RESUME_AI_EMPTY_RESULT', '未能从简历中识别出有效内容，请检查文件或稍后重试', {
      status: 503,
      retryable: true,
    });
  };
  t.after(() => {
    resumeParser.parse = originalParse;
  });

  const res = createRes();
  await controller.upload(createReq(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'RESUME_AI_EMPTY_RESULT');
  assert.equal(res.body.error.requestId, 'resume_test_123');
});

test('successful upload returns 201 and requestId without touching the database', async (t) => {
  const originalSave = Resume.prototype.save;
  const originalParse = resumeParser.parse;
  let saveCalls = 0;

  Resume.prototype.save = async function saveStub() {
    saveCalls += 1;
    return this;
  };
  resumeParser.parse = async () => ({
    personalInfo: {},
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
  });

  t.after(() => {
    Resume.prototype.save = originalSave;
    resumeParser.parse = originalParse;
  });

  const res = createRes();
  await controller.upload(createReq(), res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.id);
  assert.equal(saveCalls, 1);
  assert.equal(res.body.requestId, 'resume_test_123');
  assert.deepEqual(res.body.parsed.education, []);
});

class AppError extends Error {
  constructor(code, message, {
    status = 400,
    retryable = false,
    expose = true,
  } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.expose = expose;
  }
}

const ERROR_MESSAGES = Object.freeze({
  INPUT_NOT_FOUND: '输入不存在或无权访问',
  AGENT_SESSION_NOT_FOUND: '会话不存在或无权访问',
  AGENT_TASK_NOT_FOUND: '任务不存在或无权访问',
  JD_NOT_FOUND: 'JD 不存在或无权访问',
  RESUME_NOT_FOUND: '简历不存在或无权访问',
  ANALYSIS_NOT_FOUND: '分析记录不存在或无权访问',
  SECTION_NOT_FOUND: '未找到对应板块',
  SUPPLEMENT_NOT_FOUND: '补充信息不存在或无权访问',
  INPUT_REQUIRED: '请提供完整输入',
  ANSWER_REQUIRED: '回答不能为空',
  TEXT_REQUIRED: '文本不能为空',
});

function errorFromCode(code) {
  const notFound = code.endsWith('_NOT_FOUND');
  const retryable = (
    code.endsWith('_FAILED')
    || code.endsWith('_UNAVAILABLE')
    || code === 'AGENT_ANALYSIS_CLAIM_LOST'
  );
  return new AppError(
    code,
    ERROR_MESSAGES[code] || (retryable ? '操作暂时未完成，请稍后重试' : '操作未完成，请检查输入后重试'),
    {
      status: notFound ? 404 : retryable ? 503 : 400,
      retryable,
    },
  );
}

function toErrorResponse(error) {
  const publicError = error instanceof AppError && error.expose
    ? error
    : typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? errorFromCode(error.message)
      : new AppError('INTERNAL_ERROR', '服务暂时不可用，请稍后重试', {
        status: 500,
        retryable: true,
      });

  return {
    status: publicError.status,
    body: {
      error: {
        code: publicError.code,
        message: publicError.message,
        retryable: publicError.retryable,
      },
    },
  };
}

function sendError(res, error) {
  const { status, body } = toErrorResponse(error);
  return res.status(status).json(body);
}

function publicError(code, message, options) {
  return new AppError(code, message, options);
}

module.exports = {
  AppError,
  errorFromCode,
  publicError,
  sendError,
  toErrorResponse,
};

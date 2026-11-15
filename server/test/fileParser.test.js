const test = require('node:test');
const assert = require('node:assert/strict');

const fileParser = require('../services/fileParser');
const { AppError } = require('../utils/appError');

const { hasMeaningfulText } = fileParser;

function isClientError(code) {
  return (error) => error instanceof AppError
    && error.code === code
    && error.status === 400
    && error.expose === true;
}

test('hasMeaningfulText ignores page markers and whitespace', () => {
  assert.equal(hasMeaningfulText(''), false);
  assert.equal(hasMeaningfulText('   \n\t '), false);
  assert.equal(hasMeaningfulText('-- 1 of 1 --'), false);
  assert.equal(hasMeaningfulText('-- 1 of 3 --\n-- 2 of 3 --\n-- 3 of 3 --'), false);
  assert.equal(hasMeaningfulText('张三 前端开发工程师 三年经验'), true);
  assert.equal(hasMeaningfulText('JavaScript TypeScript Vue React Node.js'), true);
});

test('empty TXT is a clear client error', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.alloc(0), '.txt'),
    isClientError('RESUME_TEXT_EMPTY'),
  );
});

test('whitespace-only TXT is a clear client error', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.from('  \n\t  ', 'utf8'), '.txt'),
    isClientError('RESUME_TEXT_EMPTY'),
  );
});

test('valid TXT is returned unchanged', async () => {
  const text = await fileParser.extractText(Buffer.from('张三\n前端开发工程师', 'utf8'), '.txt');
  assert.equal(text, '张三\n前端开发工程师');
});

test('PDF without a PDF signature is rejected as corrupted', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.from('this is not a pdf', 'utf8'), '.pdf'),
    isClientError('RESUME_FILE_CORRUPTED'),
  );
});

test('DOCX without a ZIP signature is rejected as corrupted', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.from('this is not a docx', 'utf8'), '.docx'),
    isClientError('RESUME_FILE_CORRUPTED'),
  );
});

test('legacy .doc is rejected as an unsupported format', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.from('legacy word file', 'utf8'), '.doc'),
    isClientError('RESUME_FILE_TYPE_UNSUPPORTED'),
  );
});

test('unknown file formats are rejected as unsupported', async () => {
  await assert.rejects(
    () => fileParser.extractText(Buffer.from('image bytes'), '.png'),
    isClientError('RESUME_FILE_TYPE_UNSUPPORTED'),
  );
});

test('corrupt PDF and DOCX errors are classified as client errors', () => {
  assert.equal(fileParser.isCorruptPdfError({ name: 'InvalidPDFException', message: 'Invalid PDF structure.' }), true);
  assert.equal(fileParser.isCorruptDocxError({ message: "Can't find end of central directory" }), true);
  assert.equal(fileParser.isCorruptPdfError({ name: 'TypeError', message: 'unexpected internal failure' }), false);
  assert.equal(fileParser.isCorruptDocxError({ message: 'unexpected internal failure' }), false);
});

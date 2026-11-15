const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function proxyDefaultOrigin(relativePath) {
  const content = read(relativePath);
  const match = content.match(/process\.env\.RAILWAY_API_BASE \|\| '([^']+)'/);
  assert.ok(match, `${relativePath} 应提供 RAILWAY_API_BASE 默认值`);
  return new URL(match[1]).origin;
}

test('Vercel /api rewrite and both upload proxies target the same Railway origin', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const apiRewrite = vercel.rewrites.find((rewrite) => rewrite.source === '/api/(.*)');

  assert.ok(apiRewrite, 'vercel.json 必须有 /api/(.*) 反代规则');
  assert.ok(apiRewrite.destination.endsWith('/api/$1'), '/api 反代必须保留子路径');

  const rewriteOrigin = new URL(apiRewrite.destination).origin;
  assert.equal(proxyDefaultOrigin('api/resume/upload.js'), rewriteOrigin);
  assert.equal(proxyDefaultOrigin('api/jd/ocr.js'), rewriteOrigin);
});

test('Railway healthcheck matches the health route exposed by Express', () => {
  const railway = JSON.parse(read('railway.json'));

  assert.equal(railway.deploy.healthcheckPath, '/api/health');
  assert.match(railway.deploy.startCommand, /cd server && .*node app\.js/);
  assert.match(read('server/app.js'), /app\.get\('\/api\/health'/);
});

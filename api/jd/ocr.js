// Vercel serverless proxy for JD screenshot OCR uploads.
// Vercel external rewrites do not forward multipart/form-data bodies
// reliably, so this thin function streams the upload to the Railway backend.
const UPSTREAM = process.env.RAILWAY_API_BASE || 'https://vitafix-production.up.railway.app'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
])

module.exports = async function proxyJdOcr(req, res) {
  try {
    const headers = { ...req.headers }
    delete headers.host
    delete headers['content-length']
    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers,
      body: req,
      duplex: 'half',
      redirect: 'follow',
    })
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) res.setHeader(key, value)
    })
    const body = await upstream.arrayBuffer()
    res.send(Buffer.from(body))
  } catch (error) {
    console.error('jd ocr proxy error:', error.message)
    res.status(502).json({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: '后端服务暂不可用，请稍后重试', retryable: true },
    })
  }
}

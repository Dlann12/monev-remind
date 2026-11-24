/**
 * Vercel Serverless Function — Monev Kemnaker API Proxy
 * Forwards requests to Kemnaker with Origin and Referer headers to bypass CORS.
 */

export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const rawPath = req.query.path || ''
    const cleanPath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath.replace(/^\//, '')
    const targetUrl = new URL(`https://monev-api.maganghub.kemnaker.go.id/api/v1/${cleanPath}`)

    // Forward query params (excluding the proxy route param 'path')
    for (const [key, val] of Object.entries(req.query)) {
      if (key !== 'path') {
        targetUrl.searchParams.set(key, String(val))
      }
    }

    const headers = {
      Accept: 'application/json',
      Origin: 'https://monev.maganghub.kemnaker.go.id',
      Referer: 'https://monev.maganghub.kemnaker.go.id/'
    }

    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization
    }
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type']
    }

    const fetchOptions = {
      method: req.method,
      headers
    }

    if (!['GET', 'HEAD'].includes(req.method) && req.body) {
      fetchOptions.body =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const kemnakerRes = await fetch(targetUrl.toString(), fetchOptions)
    const contentType = kemnakerRes.headers.get('content-type') || 'application/json'

    res.status(kemnakerRes.status)
    res.setHeader('Content-Type', contentType)

    if (contentType.includes('application/json')) {
      const data = await kemnakerRes.json().catch(() => ({}))
      return res.json(data)
    } else {
      const text = await kemnakerRes.text()
      return res.send(text)
    }
  } catch (err) {
    return res.status(502).json({
      error: 'Proxy Error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

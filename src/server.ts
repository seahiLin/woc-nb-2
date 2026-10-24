import handler from '@tanstack/react-start/server-entry'

interface Env {
  FRAME_ANCESTORS?: string
}

export default {
  async fetch(request: Request, env: Env) {
    const response = await handler.fetch(request)
    // Let Sprig Studio show this app in its preview pane.
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', `frame-ancestors 'self' ${env.FRAME_ANCESTORS ?? ''}`.trim())
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
}

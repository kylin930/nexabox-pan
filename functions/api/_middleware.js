// functions/api/_middleware.js
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function withCors(response) {
  // 复制原响应并附加 CORS 头，避免修改只读 Response
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 放行更新 JWT 接口和所有公共接口 (如分享链接的数据获取)
  if (url.pathname === '/api/update_jwt' || url.pathname.startsWith('/api/public/')) {
    return withCors(await next());
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return withCors(new Response(JSON.stringify({ error: '未授权，缺少Token' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    }));
  }

  try {
    if (!env.STUDIO_KV) {
      return withCors(new Response(JSON.stringify({ error: '服务端未绑定STUDIO_KV' }), { status: 500 }));
    }

    const sessionData = await env.STUDIO_KV.get(`session:${token}`, 'json');
    if (!sessionData) {
      return withCors(new Response(JSON.stringify({ error: '登录已过期或无效' }), { status: 401 }));
    }

    const user = await env.STUDIO_KV.get(`user:${sessionData.username}`, 'json');
    const permissions = user?.permissions || [];

    if (!permissions.includes('all') && !permissions.includes('NexaboxDrive')) {
      return withCors(new Response(JSON.stringify({ error: '您没有访问网盘的权限' }), { status: 403 }));
    }

    return withCors(await next());
    
  } catch (error) {
    return withCors(new Response(JSON.stringify({ error: '账号系统读取失败', detail: error.message }), { status: 500 }));
  }
}

// functions/api/_middleware.js
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 放行更新 JWT 接口和所有公共接口 (如分享链接的数据获取)
  if (url.pathname === '/api/update_jwt' || url.pathname.startsWith('/api/public/')) {
    return next();
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: '未授权，缺少Token' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    if (!env.STUDIO_KV) {
      return new Response(JSON.stringify({ error: '服务端未绑定STUDIO_KV' }), { status: 500 });
    }

    const sessionData = await env.STUDIO_KV.get(`session:${token}`, 'json');
    if (!sessionData) {
      return new Response(JSON.stringify({ error: '登录已过期或无效' }), { status: 401 });
    }

    const user = await env.STUDIO_KV.get(`user:${sessionData.username}`, 'json');
    const permissions = user?.permissions || [];

    if (!permissions.includes('all') && !permissions.includes('NexaboxDrive')) {
      return new Response(JSON.stringify({ error: '您没有访问网盘的权限' }), { status: 403 });
    }

    return next();
    
  } catch (error) {
    return new Response(JSON.stringify({ error: '账号系统读取失败', detail: error.message }), { status: 500 });
  }
}

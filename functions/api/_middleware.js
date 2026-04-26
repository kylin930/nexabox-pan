// functions/api/_middleware.js
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === '/api/update_jwt') {
    return next();
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权，缺少Token' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.split(' ')[1];
  
  const ACCOUNT_API_URL = env.STUDIO_KV; 
  if (!ACCOUNT_API_URL) {
    return new Response(JSON.stringify({ error: '服务端未配置统一账号API地址' }), { status: 500 });
  }

  try {
    const verifyRes = await fetch(`${ACCOUNT_API_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.valid) {
      return new Response(JSON.stringify({ error: 'Token无效或已过期' }), { status: 401 });
    }

    const perms = verifyData.permissions || [];
    if (!perms.includes('all') && !perms.includes('NexaboxPan')) {
      return new Response(JSON.stringify({ error: '您没有访问该应用的权限' }), { status: 403 });
    }

    // 6. 验证通过，放行请求给下游的 API 处理 (例如 files.js)
    return next();
    
  } catch (error) {
    // 将具体的错误信息 (error.message) 暴露出来，方便我们调试
    return new Response(JSON.stringify({ 
        error: '账号系统验证服务暂时不可用', 
        detail: error.message,
        url: `${ACCOUNT_API_URL}/api/verify` // 顺便检查一下拼接的 URL 对不对
    }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
}

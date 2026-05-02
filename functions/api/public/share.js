// functions/api/public/share.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const shareId = url.searchParams.get('id');

  if (!shareId) return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });

  try {
    const shareDataStr = await env.TEACHERMATE_OSS_KV.get(`SHARE_${shareId}`);
    if (!shareDataStr) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    // 兼容旧版纯字符串格式的分享数据
    let fileId, hasPassword = false;
    try {
        const shareData = JSON.parse(shareDataStr);
        fileId = shareData.fileId;
        hasPassword = !!shareData.password;
    } catch(e) {
        fileId = shareDataStr; 
    }

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源文件已被删除" }), { status: 404 });

    const fileData = JSON.parse(fileDataStr);

    // GET 请求只返回基础信息和是否需要密码，绝不返回 chunks 数组
    return new Response(JSON.stringify({
        filename: fileData.filename,
        size: fileData.size,
        needPassword: hasPassword
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { id, password } = await request.json();
    if (!id) return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });

    const shareDataStr = await env.TEACHERMATE_OSS_KV.get(`SHARE_${id}`);
    if (!shareDataStr) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    let fileId, realPassword = null;
    try {
        const shareData = JSON.parse(shareDataStr);
        fileId = shareData.fileId;
        realPassword = shareData.password;
    } catch(e) {
        fileId = shareDataStr;
    }

    // 如果设置了密码，且用户提交的密码不匹配，则拦截
    if (realPassword && realPassword !== password) {
        return new Response(JSON.stringify({ error: "提取码错误" }), { status: 403 });
    }

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源文件已被删除" }), { status: 404 });

    // 密码正确，返回包含 chunks 的完整文件数据
    return new Response(fileDataStr, { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

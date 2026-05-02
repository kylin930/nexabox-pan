// functions/api/public/share.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const shareId = url.searchParams.get('id');

  if (!shareId) {
    return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });
  }

  try {
    // 1. 获取真实 fileId
    const fileId = await env.TEACHERMATE_OSS_KV.get(`SHARE_${shareId}`);
    if (!fileId) {
      return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });
    }

    // 2. 获取文件元数据 (分片URL等)
    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!fileDataStr) {
      return new Response(JSON.stringify({ error: "源文件已被删除" }), { status: 404 });
    }

    return new Response(fileDataStr, { 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

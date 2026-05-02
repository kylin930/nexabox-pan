// functions/api/share.js
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { fileId } = await request.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "缺少 fileId" }), { status: 400 });
    }

    // 生成一个简单的 8 位随机分享 ID
    const shareId = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    
    // 将分享 ID 和文件 ID 的映射存入 KV (此处可以设置过期时间，这里演示为永久)
    await env.TEACHERMATE_OSS_KV.put(`SHARE_${shareId}`, fileId);

    return new Response(JSON.stringify({ 
      success: true, 
      shareId: shareId,
      url: `/share.html?id=${shareId}` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

// functions/api/share.js
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { fileId, password } = await request.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "缺少 fileId" }), { status: 400 });
    }

    const shareId = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    
    // 将 fileId 和 password 封装为 JSON 存入 KV
    const shareData = { 
        fileId: fileId, 
        password: password || null 
    };
    await env.TEACHERMATE_OSS_KV.put(`SHARE_${shareId}`, JSON.stringify(shareData));

    return new Response(JSON.stringify({ 
      success: true, 
      shareId: shareId,
      url: `/share.html?id=${shareId}` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

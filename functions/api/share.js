// functions/api/share.js
// 创建分享链接：只能分享当前用户个人空间内的文件/文件夹
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const username = data?.username;
  try {
    const { fileId, password } = await request.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "缺少 fileId" }), { status: 400 });
    }

    // 【个人空间安全限制】只能分享属于当前用户的文件/文件夹
    if (!fileId.startsWith(`user:${username}:`)) {
      return new Response(JSON.stringify({ error: "只能分享您个人空间内的文件" }), { status: 403 });
    }

    const targetStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!targetStr) {
      return new Response(JSON.stringify({ error: "文件不存在或已被删除" }), { status: 404 });
    }

    const shareId = crypto.randomUUID().replace(/-/g, '').substring(0, 8);

    // 分享记录全局存放（share:<id>），内含归属人信息，公开接口据此回到归属人的个人空间取数
    const shareData = {
      owner: username,
      fileId: fileId,
      password: password || null
    };
    await env.TEACHERMATE_OSS_KV.put(`share:${shareId}`, JSON.stringify(shareData));

    return new Response(JSON.stringify({
      success: true,
      shareId: shareId,
      url: `/share.html?id=${shareId}`
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

// functions/api/folder.js
// 在当前用户的个人空间内创建虚拟文件夹
export async function onRequestPost(context) {
  const { request, env, data } = context;
  const username = data?.username;
  try {
    const { name, path = "/" } = await request.json();

    if (!name) {
      return new Response(JSON.stringify({ error: "文件夹名称不能为空" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const folderId = `user:${username}:dir:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const folderData = {
      filename: name,
      isFolder: true,
      path: path, // 这个文件夹所在的路径（例如根目录就是 "/"）
      size: 0
    };

    await env.TEACHERMATE_OSS_KV.put(folderId, JSON.stringify(folderData));

    return new Response(JSON.stringify({ success: true, folderId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

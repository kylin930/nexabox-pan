// functions/api/folder.js
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { name, path = "/" } = await request.json();
    
    if (!name) {
      return new Response(JSON.stringify({ error: "文件夹名称不能为空" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // 同样使用 FILE_ 前缀，保证 files.js 能统一读取到
    // 利用 isFolder: true 来让前端区分它是文件夹而不是普通文件
    const folderId = "FILE_DIR_" + Date.now();
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

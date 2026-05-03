// functions/api/files.js
// GET 获取指定路径下的文件列表，POST 保存新文件
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "POST") {
    // 前端上传完毕后，提交文件名和它的所有分块 URL，新增 path 字段
    const fileData = await request.json(); 
    
    // 确保 fileData 中包含 path 字段，如果前端没传，默认挂载在根目录 '/'
    fileData.path = fileData.path || "/";
    
    const fileId = "FILE_" + Date.now();
    await env.TEACHERMATE_OSS_KV.put(fileId, JSON.stringify(fileData));
    return new Response(JSON.stringify({ success: true, fileId }));
  } 
  
  if (request.method === "GET") {
    // 接收 URL 上的 path 参数，例如 /api/files?path=/photos
    const targetPath = url.searchParams.get("path") || "/";
    
    // 列出所有带有 FILE_ 前缀的键（包含普通文件和文件夹）
    const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
    let files = [];
    
    for (const key of list.keys) {
      const dataStr = await env.TEACHERMATE_OSS_KV.get(key.name);
      if (dataStr) {
        const itemData = JSON.parse(dataStr);
        const itemPath = itemData.path || "/";
        
        if (itemPath === targetPath) {
          files.push({ id: key.name, ...itemData });
        }
      }
    }
    
    files.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.filename.localeCompare(b.filename);
    });

    return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
  }
}

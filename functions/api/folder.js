// functions/api/files.js
// GET 获取指定路径下的文件列表，POST 保存新文件
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "POST") {
    const fileData = await request.json(); 
    
    // 【修复】存入前统一格式，确保新写入的数据一定包含这两个字段
    fileData.path = fileData.path || "/";
    fileData.isFolder = !!fileData.isFolder; 
    
    const fileId = "FILE_" + Date.now();
    await env.TEACHERMATE_OSS_KV.put(fileId, JSON.stringify(fileData));
    return new Response(JSON.stringify({ success: true, fileId }));
  } 
  
  if (request.method === "GET") {
    const targetPath = url.searchParams.get("path") || "/";
    const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
    let files = [];
    
    for (const key of list.keys) {
      const dataStr = await env.TEACHERMATE_OSS_KV.get(key.name);
      if (dataStr) {
        const itemData = JSON.parse(dataStr);
        
        // 【修复核心】向前端返回前，强制补全旧数据缺失的字段并规范类型
        itemData.path = itemData.path || "/";
        itemData.isFolder = !!itemData.isFolder;
        
        if (itemData.path === targetPath) {
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

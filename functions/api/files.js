// functions/api/files.js
// GET 获取指定路径下的文件列表，POST 保存新文件
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "POST") {
    try {
      const fileData = await request.json(); 
      
      fileData.path = fileData.path || "/";
      fileData.isFolder = !!fileData.isFolder; 
      
      const fileId = "FILE_" + Date.now();
      await env.TEACHERMATE_OSS_KV.put(fileId, JSON.stringify(fileData));
      return new Response(JSON.stringify({ success: true, fileId }));
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON data" }), { status: 400 });
    }
  } 
  
  if (request.method === "GET") {
    try {
      const targetPath = url.searchParams.get("path") || "/";
      const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
      let files = [];
      
      for (const key of list.keys) {
        const dataStr = await env.TEACHERMATE_OSS_KV.get(key.name);
        if (dataStr) {
          try {
            const itemData = JSON.parse(dataStr);
            
            // 【核心修复：数据清洗与降级兼容】
            // 1. 纠正错乱的名称：兼容旧版或错误数据里的 `name` 字段
            itemData.filename = itemData.filename || itemData.name || "未知名称";
            
            // 2. 智能推断文件夹状态：
            if (itemData.isFolder !== undefined) {
                // 如果数据库里有明确标识，则直接转换为布尔值
                itemData.isFolder = !!itemData.isFolder; 
            } else {
                // 如果数据库里缺失标识（脏数据）：
                // 只要 ID 带 DIR 标识，或者 它既没有文件大小(size) 也没有分片(chunks)，我们就智能推测它是文件夹
                itemData.isFolder = key.name.includes('FILE_DIR_') || (itemData.chunks === undefined && itemData.size === undefined);
            }
            
            // 3. 统一路径
            itemData.path = itemData.path || "/";
            
            if (itemData.path === targetPath) {
              files.push({ id: key.name, ...itemData });
            }
          } catch (parseError) {
            continue; // 静默跳过无法解析的死数据
          }
        }
      }
      
      files.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        const nameA = a.filename || "";
        const nameB = b.filename || "";
        return nameA.localeCompare(nameB);
      });

      return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

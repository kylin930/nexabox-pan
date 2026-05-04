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
      // 防止 POST 畸形 JSON 导致崩溃
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
            
            itemData.path = itemData.path || "/";
            itemData.isFolder = !!itemData.isFolder;
            
            if (itemData.path === targetPath) {
              files.push({ id: key.name, ...itemData });
            }
          } catch (parseError) {
            // 【修复1】静默捕获 JSON 解析错误，跳过这条坏数据，而不是让整个接口崩溃
            console.error(`跳过解析失败的 KV 键: ${key.name}`);
            continue;
          }
        }
      }
      
      files.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        
        // 【修复2】加入防御性空值兜底，防止 a.filename 或 b.filename 为 undefined 导致 localeCompare 崩溃
        const nameA = a.filename || "";
        const nameB = b.filename || "";
        return nameA.localeCompare(nameB);
      });

      return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
  }

  // 【修复3】兜底返回，防止 OPTIONS 或其他请求方式导致函数返回 undefined 而触发 1101 错误
  return new Response("Method not allowed", { status: 405 });
}

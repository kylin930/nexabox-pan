// GET 获取文件列表，POST 保存新文件
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "POST") {
    // 前端上传完毕后，提交文件名和它的所有分块 URL
    const fileData = await request.json(); // { filename: "movie.mp4", chunks: ["url1", "url2"] }
    const fileId = "FILE_" + Date.now();
    await env.TEACHERMATE_OSS_KV.put(fileId, JSON.stringify(fileData));
    return new Response(JSON.stringify({ success: true, fileId }));
  } 
  
  if (request.method === "GET") {
    // 列出所有文件
    const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
    let files = [];
    for (const key of list.keys) {
      const dataStr = await env.TEACHERMATE_OSS_KV.get(key.name);
      if (dataStr) {
        files.push({ id: key.name, ...JSON.parse(dataStr) });
      }
    }
    return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
  }
}

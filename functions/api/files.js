// functions/api/files.js
// GET 获取当前用户指定路径下的文件列表，POST 保存新文件（数据按用户隔离）
export async function onRequest(context) {
  const { request, env, data } = context;
  const username = data?.username;
  const url = new URL(request.url);

  if (request.method === "POST") {
    try {
      const fileData = await request.json();

      fileData.path = fileData.path || "/";
      fileData.isFolder = false;

      const fileId = `user:${username}:file:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.TEACHERMATE_OSS_KV.put(fileId, JSON.stringify(fileData));
      return new Response(JSON.stringify({ success: true, fileId }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON data" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  }

  if (request.method === "GET") {
    try {
      const targetPath = url.searchParams.get("path") || "/";
      const files = [];

      // 只扫描当前用户个人空间内的文件与文件夹
      const keys = [
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, `user:${username}:file:`),
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, `user:${username}:dir:`),
      ];

      for (const key of keys) {
        const dataStr = await env.TEACHERMATE_OSS_KV.get(key);
        if (!dataStr) continue;
        try {
          const itemData = JSON.parse(dataStr);
          if ((itemData.path || "/") === targetPath) {
            files.push({ id: key, ...itemData, path: itemData.path || "/", isFolder: !!itemData.isFolder });
          }
        } catch (parseError) {
          continue; // 静默跳过无法解析的脏数据
        }
      }

      files.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return (a.filename || "").localeCompare(b.filename || "");
      });

      return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

// KV list 单页最多返回 1000 条，这里通过游标翻页拿全量
async function listAllKeys(kv, prefix) {
  const keys = [];
  let cursor;
  while (true) {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) keys.push(k.name);
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return keys;
}

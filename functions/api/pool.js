// functions/api/pool.js
// 资源池（全员共享空间）：所有拥有网盘权限的用户共用
// GET 列取资源池文件/文件夹，POST 保存文件元数据或创建文件夹（isFolder: true）
export async function onRequest(context) {
  const { request, env, data } = context;
  const username = data?.username;
  const url = new URL(request.url);

  if (request.method === "POST") {
    try {
      const itemData = await request.json();

      // 兼容 filename / name 两种字段名
      itemData.filename = itemData.filename || itemData.name;
      if (!itemData.filename) {
        return new Response(JSON.stringify({ error: "名称不能为空" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      itemData.path = itemData.path || "/";
      itemData.isFolder = !!itemData.isFolder;
      // 共享空间记录上传者，便于溯源
      itemData.uploader = username;

      const kind = itemData.isFolder ? "dir" : "file";
      const itemId = `pool:${kind}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await env.TEACHERMATE_OSS_KV.put(itemId, JSON.stringify(itemData));
      return new Response(JSON.stringify({ success: true, fileId: itemId }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON data" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  }

  if (request.method === "GET") {
    try {
      const targetPath = url.searchParams.get("path") || "/";
      const files = [];

      // 扫描共享资源池内的全部文件与文件夹
      const keys = [
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, `pool:file:`),
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, `pool:dir:`),
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

// functions/api/search.js
// 在当前用户的个人空间内按文件名模糊搜索
export async function onRequestGet(context) {
  const { request, env, data } = context;
  const username = data?.username;
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) {
    return new Response(JSON.stringify({ error: "缺少搜索关键词" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const kv = env.TEACHERMATE_OSS_KV;

    // 只扫描当前用户自己的文件与文件夹
    const keys = [
      ...await listAllKeys(kv, `user:${username}:file:`),
      ...await listAllKeys(kv, `user:${username}:dir:`),
    ];
    let results = [];

    for (const key of keys) {
      const dataStr = await kv.get(key);
      if (!dataStr) continue;
      const itemData = JSON.parse(dataStr);

      // 忽略大小写进行名称模糊匹配
      if (itemData.filename && itemData.filename.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          id: key,
          ...itemData,
          path: itemData.path || "/",
          isFolder: !!itemData.isFolder
        });
      }
    }

    // 排序：文件夹优先，再按字母顺序排列
    results.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.filename.localeCompare(b.filename);
    });

    return new Response(JSON.stringify(results), {
        headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "搜索失败，内部错误" }), { status: 500 });
  }
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

// functions/api/search.js
// 搜索文件/文件夹：默认搜当前用户的个人空间，scope=pool 时搜共享资源池
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
    // scope=pool 时搜索共享资源池，默认只扫描当前用户个人空间内的文件与文件夹
    const scope = url.searchParams.get('scope');
    const keys = scope === 'pool'
      ? [
          ...await listAllKeys(env.TEACHERMATE_OSS_KV, `pool:file:`),
          ...await listAllKeys(env.TEACHERMATE_OSS_KV, `pool:dir:`),
        ]
      : [
          ...await listAllKeys(env.TEACHERMATE_OSS_KV, `user:${username}:file:`),
          ...await listAllKeys(env.TEACHERMATE_OSS_KV, `user:${username}:dir:`),
        ];
    let results = [];

    for (const key of keys) {
      const dataStr = await env.TEACHERMATE_OSS_KV.get(key);
      if (!dataStr) continue;
      try {
        const itemData = JSON.parse(dataStr);

        // 保证返回结构统一
        itemData.path = itemData.path || "/";
        itemData.isFolder = !!itemData.isFolder;

        // 忽略大小写进行名称模糊匹配
        if (itemData.filename && itemData.filename.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({ id: key, ...itemData });
        }
      } catch (e) { continue; }
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

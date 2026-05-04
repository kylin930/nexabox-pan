// functions/api/search.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) {
    return new Response(JSON.stringify({ error: "缺少搜索关键词" }), { 
        status: 400, 
        headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
    let results = [];
    
    for (const key of list.keys) {
      const dataStr = await env.TEACHERMATE_OSS_KV.get(key.name);
      if (dataStr) {
        const itemData = JSON.parse(dataStr);
        
        // 保证返回结构统一
        itemData.path = itemData.path || "/";
        itemData.isFolder = !!itemData.isFolder;

        // 忽略大小写进行名称模糊匹配
        if (itemData.filename && itemData.filename.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({ id: key.name, ...itemData });
        }
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

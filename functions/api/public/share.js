// functions/api/public/share.js
// 公开分享接口（无需登录）：从分享记录回到归属人的个人空间取数
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const shareId = url.searchParams.get('id');

  if (!shareId) return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });

  try {
    const shareData = await readShare(env, shareId);
    if (!shareData) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(shareData.fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源文件已被删除" }), { status: 404 });

    const fileData = JSON.parse(fileDataStr);

    // 向前端暴露 isFolder 属性，便于前端区分是文件还是文件夹
    return new Response(JSON.stringify({
      filename: fileData.filename,
      size: fileData.size,
      isFolder: !!fileData.isFolder,
      needPassword: !!shareData.password
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { id, password } = await request.json();
    if (!id) return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });

    const shareData = await readShare(env, id);
    if (!shareData) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    if (shareData.password && shareData.password !== password) {
      return new Response(JSON.stringify({ error: "提取码错误" }), { status: 403 });
    }

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(shareData.fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源目录/文件已被删除" }), { status: 404 });

    const fileData = JSON.parse(fileDataStr);

    // 如果分享的是文件夹，聚合归属人个人空间内该目录下所有的子文件/文件夹
    if (fileData.isFolder) {
      // 计算当前文件夹的全路径，例如 name为"photos", path为"/", 则 fullPath 为 "/photos/"
      const basePath = fileData.path === '/' ? '' : fileData.path;
      const fullPath = `${basePath}/${fileData.filename}/`.replace(/\/\//g, '/');

      // 资源池文件夹从 pool: 前缀聚合子项，个人空间文件夹从归属人前缀聚合
      const keyPrefixes = shareData.fileId.startsWith('pool:')
        ? ['pool:file:', 'pool:dir:']
        : [`user:${shareData.owner}:file:`, `user:${shareData.owner}:dir:`];
      const keys = [
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, keyPrefixes[0]),
        ...await listAllKeys(env.TEACHERMATE_OSS_KV, keyPrefixes[1]),
      ];
      let children = [];

      for (const key of keys) {
        const childStr = await env.TEACHERMATE_OSS_KV.get(key);
        if (!childStr) continue;
        try {
          const childData = JSON.parse(childStr);

          // 统一补全子文件/子目录的缺失字段
          childData.path = childData.path || "/";
          childData.isFolder = !!childData.isFolder;

          if (childData.path.startsWith(fullPath)) {
            children.push({ id: key, ...childData });
          }
        } catch (e) { continue; }
      }
      fileData.children = children;
      fileData.fullPath = fullPath;
    }

    return new Response(JSON.stringify(fileData), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

// 读取分享记录，格式不合法一律视为已失效
async function readShare(env, shareId) {
  const shareDataStr = await env.TEACHERMATE_OSS_KV.get(`share:${shareId}`);
  if (!shareDataStr) return null;
  try {
    const shareData = JSON.parse(shareDataStr);
    return shareData?.fileId ? shareData : null;
  } catch (e) {
    return null;
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

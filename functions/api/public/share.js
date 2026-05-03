// functions/api/public/share.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const shareId = url.searchParams.get('id');

  if (!shareId) return new Response(JSON.stringify({ error: "缺少分享 ID" }), { status: 400 });

  try {
    const shareDataStr = await env.TEACHERMATE_OSS_KV.get(`SHARE_${shareId}`);
    if (!shareDataStr) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    let fileId, hasPassword = false;
    try {
        const shareData = JSON.parse(shareDataStr);
        fileId = shareData.fileId;
        hasPassword = !!shareData.password;
    } catch(e) {
        fileId = shareDataStr; 
    }

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源文件已被删除" }), { status: 404 });

    const fileData = JSON.parse(fileDataStr);

    // 新增：向前端暴露 isFolder 属性，便于前端区分是文件还是文件夹
    return new Response(JSON.stringify({
        filename: fileData.filename,
        size: fileData.size,
        isFolder: !!fileData.isFolder,
        needPassword: hasPassword
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

    const shareDataStr = await env.TEACHERMATE_OSS_KV.get(`SHARE_${id}`);
    if (!shareDataStr) return new Response(JSON.stringify({ error: "分享链接不存在或已失效" }), { status: 404 });

    let fileId, realPassword = null;
    try {
        const shareData = JSON.parse(shareDataStr);
        fileId = shareData.fileId;
        realPassword = shareData.password;
    } catch(e) { fileId = shareDataStr; }

    if (realPassword && realPassword !== password) {
        return new Response(JSON.stringify({ error: "提取码错误" }), { status: 403 });
    }

    const fileDataStr = await env.TEACHERMATE_OSS_KV.get(fileId);
    if (!fileDataStr) return new Response(JSON.stringify({ error: "源目录/文件已被删除" }), { status: 404 });

    const fileData = JSON.parse(fileDataStr);

    // 新增核心逻辑：如果是文件夹，我们需要获取该目录下所有的子文件/文件夹
    if (fileData.isFolder) {
        // 计算当前文件夹的全路径，例如 name为"photos", path为"/", 则 fullPath 为 "/photos/"
        const basePath = fileData.path === '/' ? '' : fileData.path;
        const fullPath = `${basePath}/${fileData.filename}/`.replace(/\/\//g, '/');
        
        const list = await env.TEACHERMATE_OSS_KV.list({ prefix: "FILE_" });
        let children = [];
        
        for (const key of list.keys) {
            const childStr = await env.TEACHERMATE_OSS_KV.get(key.name);
            if (childStr) {
                const childData = JSON.parse(childStr);
                const cPath = childData.path || "/";
                // 只要路径以该文件夹全路径开头，就说明它是子文件
                if (cPath.startsWith(fullPath)) {
                    children.push({ id: key.name, ...childData });
                }
            }
        }
        fileData.children = children;
        fileData.fullPath = fullPath;
    }

    return new Response(JSON.stringify(fileData), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "内部错误" }), { status: 500 });
  }
}

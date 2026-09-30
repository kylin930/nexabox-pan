// functions/api/purge-legacy.js
// 一次性清空旧版共享空间的 KV 数据（FILE_ / SHARE_ 前缀）
// GET 查询剩余旧数据条数，POST 执行清空（仅管理员可执行）
const LEGACY_PREFIXES = ['FILE_', 'SHARE_'];

export async function onRequestGet(context) {
  const { env } = context;
  try {
    let remaining = 0;
    for (const prefix of LEGACY_PREFIXES) {
      remaining += (await listAllKeys(env.TEACHERMATE_OSS_KV, prefix)).length;
    }
    return new Response(JSON.stringify({ remaining }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "查询旧数据失败" }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, data } = context;

  // 仅管理员（拥有 all 权限）可执行清空
  if (!(data?.permissions || []).includes('all')) {
    return new Response(JSON.stringify({ error: "仅管理员可执行旧数据清空" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  try {
    let deleted = 0;
    for (const prefix of LEGACY_PREFIXES) {
      const keys = await listAllKeys(env.TEACHERMATE_OSS_KV, prefix);
      for (const key of keys) {
        await env.TEACHERMATE_OSS_KV.delete(key);
        deleted++;
      }
    }
    return new Response(JSON.stringify({ success: true, deleted }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "清空旧数据失败" }), { status: 500 });
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

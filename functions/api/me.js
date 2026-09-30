// functions/api/me.js
// 返回当前登录用户信息，供前端展示与功能开关（如管理员清空旧数据入口）
export async function onRequestGet(context) {
  const { data } = context;
  return new Response(JSON.stringify({
    username: data?.username || null,
    permissions: data?.permissions || []
  }), { headers: { "Content-Type": "application/json" } });
}

// 前端请求此接口，CF 携带 KV 中的 JWT 去向 Teachermate 拿签名
export async function onRequestGet(context) {
  const { env } = context;
  
  const token = await env.TEACHERMATE_OSS_KV.get("TEACHERMATE_JWT");
  if (!token) {
    return new Response(JSON.stringify({ error: "JWT 不存在或已过期，请检查本地节点" }), { status: 500 });
  }

  const url = "https://www.teachermate.com.cn/api/v1/upload/oss/signature?type=image/png";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token.startsWith("JWT ") ? token : `JWT ${token}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "获取签名失败" }), { status: response.status });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), { 
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

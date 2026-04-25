export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    if (data.secret !== "chocola690x") {
      return new Response("Unauthorized", { status: 401 });
    }
    
    await env.TEACHERMATE_OSS_KV.put("TEACHERMATE_JWT", data.jwt);
    return new Response(JSON.stringify({ success: true, message: "JWT更新成功" }), { status: 200 });
  } catch (error) {
    return new Response("Bad Request", { status: 400 });
  }
}

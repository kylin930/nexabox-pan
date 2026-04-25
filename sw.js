// sw.js - 负责拦截请求并流式拼接文件
const version = 'v1';

// 临时存储下载任务的元数据：ID -> { filename, chunks, size }
const downloadTasks = new Map();

self.addEventListener('install', (event) => {
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PREPARE_DOWNLOAD') {
        const { id, filename, chunks, size } = event.data;
        // 将任务信息存入内存 Map 中
        downloadTasks.set(id, { filename, chunks, size });
        console.log(`[SW] 已接收下载任务: ${filename}, ID: ${id}`);
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 检查是否是我们约定的虚拟下载路径
    if (url.pathname.startsWith('/virtual-download/')) {
        const fileId = url.pathname.split('/').pop();
        const task = downloadTasks.get(fileId);

        if (!task) {
            return event.respondWith(new Response('下载任务已过期或不存在', { status: 404 }));
        }

        // 创建一个可读流
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // 遍历所有的分块 URL
                    for (let i = 0; i < task.chunks.length; i++) {
                        const chunkUrl = task.chunks[i];
                        console.log(`[SW] 正在拉取分块 ${i + 1}/${task.chunks.length}`);
                        
                        const response = await fetch(chunkUrl);
                        if (!response.ok) throw new Error(`拉取分块失败: ${response.status}`);
                        
                        // 获取分块的读取器，将其数据逐个打入流中
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value); // 将二进制数据推入水管
                        }
                    }
                    console.log(`[SW] 所有分块传输完毕，关闭流。`);
                    controller.close();
                } catch (error) {
                    console.error('[SW] 流处理错误:', error);
                    controller.error(error);
                } finally {
                    // 下载结束后清理任务内存
                    downloadTasks.delete(fileId);
                }
            }
        });

        // 构造响应头，欺骗浏览器这是一个要下载的附件
        // 核心：设置 Content-Disposition 触发下载，设置 Content-Length 显示原生进度条
        const headers = new Headers({
            'Content-Type': 'application/octet-stream',
            // 解决中文文件名乱码问题
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(task.filename)}`,
            'Content-Length': task.size.toString() 
        });

        event.respondWith(new Response(stream, { headers }));
    }
});

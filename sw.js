// sw.js - 负责拦截请求并流式拼接文件
const version = 'v2'; // 更新版本号

// 临时存储下载任务的元数据：ID -> { filename, chunks, size, isPreview }
const downloadTasks = new Map();

self.addEventListener('install', (event) => {
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 简单的 MIME 类型推断函数
function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg', 'mov': 'video/quicktime',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac', 'aac': 'audio/aac',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PREPARE_DOWNLOAD') {
        const { id, filename, chunks, size, isPreview } = event.data;
        // 存入内存，增加 isPreview 标识
        downloadTasks.set(id, { filename, chunks, size, isPreview: !!isPreview });
        console.log(`[SW] 已接收任务: ${filename}, ID: ${id}, 模式: ${isPreview ? '预览' : '下载'}`);
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/virtual-download/')) {
        const fileId = url.pathname.split('/').pop();
        const task = downloadTasks.get(fileId);

        if (!task) {
            return event.respondWith(new Response('下载任务已过期或不存在', { status: 404 }));
        }

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for (let i = 0; i < task.chunks.length; i++) {
                        console.log(`[SW] 正在拉取分块 ${i + 1}/${task.chunks.length}`);
                        const response = await fetch(task.chunks[i]);
                        if (!response.ok) throw new Error(`拉取分块失败: ${response.status}`);
                        
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                        }
                    }
                    console.log(`[SW] 所有分块传输完毕。`);
                    controller.close();
                } catch (error) {
                    console.error('[SW] 流处理错误:', error);
                    controller.error(error);
                } finally {
                    downloadTasks.delete(fileId);
                }
            }
        });

        // 动态构造响应头
        const mimeType = task.isPreview ? getMimeType(task.filename) : 'application/octet-stream';
        const headers = new Headers({
            'Content-Type': mimeType,
            'Content-Length': task.size.toString() 
        });

        // 如果是预览模式，使用 inline；否则使用 attachment 触发下载
        if (task.isPreview) {
            headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        } else {
            headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        }

        event.respondWith(new Response(stream, { headers }));
    }
});

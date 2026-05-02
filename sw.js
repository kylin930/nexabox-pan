// sw.js - 负责拦截请求并流式拼接文件
const version = 'v3'; // 升级版本号，确保前端更新

// 临时存储下载任务的元数据
const downloadTasks = new Map();

self.addEventListener('install', (event) => {
    self.skipWaiting(); // 强制新版本立即安装
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // 立即接管所有页面
});

// 简单的 MIME 类型推断
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
        downloadTasks.set(id, { filename, chunks, size, isPreview: !!isPreview });
        console.log(`[SW] 已接收任务: ${filename}, ID: ${id}, 模式: ${isPreview ? '预览' : '下载'}`);
        
        // 可选：如果是预览任务，设定 2 小时后自动清理内存，防止内存泄漏
        if (isPreview) {
            setTimeout(() => {
                if (downloadTasks.has(id)) {
                    downloadTasks.delete(id);
                    console.log(`[SW] 预览任务 ${id} 已过期清理`);
                }
            }, 2 * 60 * 60 * 1000); 
        }
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

        // 记录拉取进度状态，防止重复请求时从头拉取（简单处理，每次请求都当做全新的流）
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
                    console.log(`[SW] ${task.filename} 传输完毕。`);
                    controller.close();
                } catch (error) {
                    console.log('[SW] 流中断或出错 (视频探测断开属正常现象):', error.message);
                    controller.error(error);
                } finally {
                    // 核心修复：下载任务可以删，预览任务（尤其是音视频）绝对不能立刻删！
                    if (!task.isPreview) {
                        downloadTasks.delete(fileId);
                    }
                }
            },
            cancel() {
                console.log('[SW] 浏览器主动取消了读取流（视频/音频播放器的常规行为）');
            }
        });

        const mimeType = task.isPreview ? getMimeType(task.filename) : 'application/octet-stream';
        const headers = new Headers({
            'Content-Type': mimeType,
            'Content-Length': task.size.toString(),
            // 核心修复：告诉视频播放器不要尝试 Range 分段请求，直接按流顺序读取
            'Accept-Ranges': 'none' 
        });

        if (task.isPreview) {
            headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        } else {
            headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        }

        event.respondWith(new Response(stream, { headers }));
    }
});

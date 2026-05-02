// sw.js - 支持 HTTP 206 断点续传与媒体拖拽
const version = 'v4'; 

// 临时存储下载任务的元数据
const downloadTasks = new Map();

// 必须与前端上传时的切片大小保持绝对一致！
const CHUNK_SIZE = 250 * 1024 * 1024; 

self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg', 'mov': 'video/quicktime',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac', 'aac': 'audio/aac',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
        'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PREPARE_DOWNLOAD') {
        const { id, filename, chunks, size, isPreview } = event.data;
        downloadTasks.set(id, { filename, chunks, size: Number(size), isPreview: !!isPreview });
        console.log(`[SW] 已接收任务: ${filename}, 模式: ${isPreview ? '预览' : '下载'}`);
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

        // 1. 解析浏览器发来的 Range 请求头 (例如: "bytes=1000-2000" 或 "bytes=1000-")
        const rangeHeader = event.request.headers.get('Range');
        let start = 0;
        let end = task.size - 1;
        let isRangeRequest = false;

        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
                start = parseInt(match[1], 10);
                if (match[2]) end = parseInt(match[2], 10);
                isRangeRequest = true;
            }
        }

        // 2. 构建数据流
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let currentPos = start;
                    let startChunkIdx = Math.floor(start / CHUNK_SIZE);
                    
                    // 遍历需要读取的分片
                    for (let i = startChunkIdx; i < task.chunks.length; i++) {
                        if (currentPos > end) break; 
                        
                        // 计算当前物理分片中，我们需要读取的起止字节
                        const chunkStartByte = currentPos % CHUNK_SIZE;
                        const chunkEndByte = (i === Math.floor(end / CHUNK_SIZE)) 
                            ? (end % CHUNK_SIZE) 
                            : (CHUNK_SIZE - 1);
                        
                        console.log(`[SW] 请求分块 ${i + 1}/${task.chunks.length}, OSS Range: ${chunkStartByte}-${chunkEndByte}`);
                        
                        const fetchHeaders = new Headers();
                        // 核心：把虚拟的范围请求，转换为对 OSS 真实文件的 206 范围请求
                        fetchHeaders.set('Range', `bytes=${chunkStartByte}-${chunkEndByte}`);

                        const response = await fetch(task.chunks[i], { headers: fetchHeaders });
                        if (!response.ok && response.status !== 206) throw new Error(`OSS 返回错误: ${response.status}`);
                        
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                            currentPos += value.length;
                        }
                    }
                    controller.close();
                } catch (error) {
                    console.log(`[SW] 流中断: ${error.message} (视频探测跳跃属正常现象)`);
                    controller.error(error);
                } finally {
                    // 如果是下载模式，下载完就清理；如果是预览模式，绝对不能清理，因为用户可能拖拽进度条
                    if (!task.isPreview && !isRangeRequest) {
                        downloadTasks.delete(fileId);
                    }
                }
            },
            cancel() {
                console.log('[SW] 浏览器主动取消了读取流 (切换进度或关闭页面)');
            }
        });

        // 3. 构建给浏览器的响应头
        const mimeType = task.isPreview ? getMimeType(task.filename) : 'application/octet-stream';
        const headers = new Headers({
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes', // 明确告诉浏览器：我们支持拖拽进度条
            'Content-Length': (end - start + 1).toString()
        });

        if (task.isPreview) {
            headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        } else {
            headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        }

        // 4. 返回 206 断点续传响应 或 200 完整响应
        if (isRangeRequest) {
            headers.set('Content-Range', `bytes ${start}-${end}/${task.size}`);
            event.respondWith(new Response(stream, { status: 206, headers }));
        } else {
            event.respondWith(new Response(stream, { status: 200, headers }));
        }
    }
});

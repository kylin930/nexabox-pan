// sw.js - 支持 HTTP 206 断点续传与优雅断连
const version = 'v5'; 

const downloadTasks = new Map();
const CHUNK_SIZE = 250 * 1024 * 1024; // 必须与上传切片大小一致

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

        // --- 核心修复区：增加 isCancelled 标志 ---
        let isCancelled = false;

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let currentPos = start;
                    let startChunkIdx = Math.floor(start / CHUNK_SIZE);
                    
                    for (let i = startChunkIdx; i < task.chunks.length; i++) {
                        // 如果浏览器已经取消，立刻停止向 OSS 发起新请求
                        if (currentPos > end || isCancelled) break; 
                        
                        const chunkStartByte = currentPos % CHUNK_SIZE;
                        const chunkEndByte = (i === Math.floor(end / CHUNK_SIZE)) 
                            ? (end % CHUNK_SIZE) 
                            : (CHUNK_SIZE - 1);
                        
                        const fetchHeaders = new Headers();
                        fetchHeaders.set('Range', `bytes=${chunkStartByte}-${chunkEndByte}`);

                        const response = await fetch(task.chunks[i], { headers: fetchHeaders });
                        if (!response.ok && response.status !== 206) throw new Error(`OSS 返回错误: ${response.status}`);
                        
                        const reader = response.body.getReader();
                        while (true) {
                            // 每次读取前检查是否被取消，如果取消则优雅关闭底层 reader 节省你的 OSS 流量
                            if (isCancelled) {
                                await reader.cancel();
                                break;
                            }

                            const { done, value } = await reader.read();
                            if (done) break;
                            
                            try {
                                controller.enqueue(value);
                            } catch (e) {
                                // 捕获“水管已焊死”的错误，静默退出，不再引发全局报错崩溃
                                isCancelled = true;
                                await reader.cancel();
                                break;
                            }
                            currentPos += value.length;
                        }
                    }
                    if (!isCancelled) {
                        controller.close();
                    }
                } catch (error) {
                    if (!isCancelled) {
                        console.error(`[SW] 流异常中断:`, error);
                        controller.error(error);
                    }
                } finally {
                    if (!task.isPreview && !isRangeRequest) {
                        downloadTasks.delete(fileId);
                    }
                }
            },
            cancel() {
                // 浏览器主动切断连接时触发，将标志位置为 true
                isCancelled = true;
                console.log(`[SW] 浏览器已主动截断连接 (Range: ${start}-${end})`);
            }
        });

        const mimeType = task.isPreview ? getMimeType(task.filename) : 'application/octet-stream';
        const headers = new Headers({
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start + 1).toString()
        });

        if (task.isPreview) {
            headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        } else {
            headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(task.filename)}`);
        }

        if (isRangeRequest) {
            headers.set('Content-Range', `bytes ${start}-${end}/${task.size}`);
            event.respondWith(new Response(stream, { status: 206, headers }));
        } else {
            event.respondWith(new Response(stream, { status: 200, headers }));
        }
    }
});

# nexabox-pan
Nexabox内部网盘（个人空间版）

- 每个账号拥有独立的个人空间，文件/文件夹按用户隔离存储（`user:<用户名>:file:` / `user:<用户名>:dir:` 前缀），分享记录为 `share:<id>`（内含归属人）。
- 旧版共享空间数据（`FILE_` / `SHARE_` 前缀）已废弃：管理员登录首页点击「清空旧版共享数据」，或调用 `POST /api/purge-legacy` 即可一次性删除。

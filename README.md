# 团队工作日报实时同步系统

一套完整的工作日报管理解决方案，支持员工日报填写、管理看板、实时同步、统计图表。

## 功能特性

### 员工端
- 📝 每日工作日报填写（14个字段）
- 📊 进度实时更新
- 📅 历史记录查看
- 🔄 切换登录身份

### 管理端
- 👁️ 实时看板（所有员工填写内容一览）
- 📈 统计图表（部门分布、提交趋势、任务分类、完成率）
- 💬 批注反馈
- 🔍 多维度筛选（日期、部门、关键词）
- 👥 团队管理（增删员工）

### 技术特性
- ⚡ 实时同步（Socket.IO）
- 📱 响应式设计（支持手机/电脑）
- 💾 本地数据库（SQLite）
- 🔐 数据自主掌控

## 快速开始

### Windows 系统
双击运行 `启动.bat` 或在命令行执行：
```bash
cd team-diary
启动.bat
```

### Mac/Linux 系统
```bash
cd team-diary
chmod +x 启动.sh
./启动.sh
```

### 手动启动
```bash
cd team-diary
npm install
npm start
```

## 访问地址

启动后，在浏览器中打开：
- **员工日报**: http://localhost:3000/index.html
- **管理看板**: http://localhost:3000/admin.html

## 远程访问配置

要让员工在外部网络访问，需要配置内网穿透。

### 方案一：Cloudflare Tunnel（推荐）

1. 注册 Cloudflare 账号：https://dash.cloudflare.com/
2. 下载 cloudflared：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
3. 登录：
   ```bash
   cloudflared tunnel login
   ```
4. 创建隧道：
   ```bash
   cloudflared tunnel create diary-tunnel
   ```
5. 配置隧道：
   ```bash
   # 编辑 ~/.cloudflared/config.yml
   tunnel: <你的隧道ID>
   credentials-file: /root/.cloudflared/<隧道ID>.json
   ingress:
     - hostname: diary.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```
6. 启动隧道：
   ```bash
   cloudflared tunnel run diary-tunnel
   ```
7. 员工访问：https://diary.yourdomain.com

### 方案二：ngrok

1. 下载 ngrok：https://ngrok.com/download
2. 注册并获取 authtoken
3. 配置：
   ```bash
   ngrok config add-authtoken <你的token>
   ```
4. 启动：
   ```bash
   ngrok http 3000
   ```
5. 使用生成的 https 地址分享给员工

### 方案三：natapp（国内用户）

1. 注册 natapp：https://natapp.cn/
2. 购买隧道（免费隧道需实名）
3. 下载客户端
4. 配置 authtoken
5. 启动：
   ```bash
   natapp -authtoken=你的token
   ```

## 默认员工账号

系统预置了8名示例员工：
- 张三、李四（前端催收）
- 王五、赵六（后端催收）
- 钱七、孙八（BPO催收）
- 周九、吴十（前端/后端催收）

## 截图预览

系统界面采用现代化设计，包含：
- 员工端：简洁的日报填写界面
- 管理端：深色主题的数据看板

## 数据存储

所有数据存储在 `data/diary.db`（SQLite数据库）

如需备份，直接复制该文件即可。

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **实时通信**: Socket.IO
- **前端**: HTML5 + CSS3 + Vanilla JS
- **图表**: Chart.js

## 常见问题

### Q: 端口被占用？
修改 `server.js` 中的 `PORT` 或在环境变量中设置。

### Q: 如何重置数据？
删除 `data/diary.db`，重启服务器会自动创建。

### Q: 如何添加新员工？
管理端 → 团队管理 → 添加员工，或在员工端首次登录时自动添加。

## License

MIT

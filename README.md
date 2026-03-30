# B站视频ASR提取&成片效果分析工具

一个功能丰富的Web应用，支持提取B站视频字幕/ASR文本、多视频截帧对照、排名打标，并可导出HTML对比文档。

## 访问链接：
http://47.99.189.18:5000/

## 功能特点

- **字幕提取**：自动提取B站视频的字幕和ASR（自动语音识别）文本
- **多视频截帧对照**：上传最多2个本地视频，按字幕时间点自动截帧，多列对照展示
- **排名打标**：对每行截帧进行1/2/3排名，自动计算Best最优视频
- **列名编辑**：双击列头可自定义视频名称
- **备注功能**：每行可添加备注说明
- **导出HTML**：一键导出包含GSB对比总结、排名、备注的完整HTML文档
- **阿里云OSS**：视频和导出文件自动上传至阿里云OSS存储
- **FFmpeg截帧**：支持精确时间点截帧（需安装FFmpeg）
- **会话恢复**：刷新页面后自动恢复上次的工作状态

## 技术栈

- **后端**：Node.js + Express
- **前端**：HTML + CSS + JavaScript（单页应用）
- **存储**：阿里云OSS
- **截帧**：FFmpeg
- **API**：B站官方API

## 安装步骤

### 1. 安装 Node.js

确保已安装 Node.js 18 或更高版本。

### 2. 安装 FFmpeg（可选，用于截帧功能）

- Windows：从 https://www.gyan.dev/ffmpeg/builds/ 下载并添加到 PATH
- Linux：`apt install -y ffmpeg`

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

创建 `.env` 文件：

```env
OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=你的AccessKeyID
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称
PORT=5000
```

### 5. 启动服务

```bash
node server.js
```

在浏览器中打开：http://localhost:5000

## 使用方法

1. **设置Cookie**：点击"Cookie设置"，输入B站登录Cookie（SESSDATA、bili_jct、DedeUserID）
2. **提取字幕**：粘贴B站视频链接，点击"提取文本"
3. **查看字幕**：从字幕列表中选择一个查看，支持复制和下载
4. **上传视频**：上传最多2个本地视频进行对比
5. **截帧对比**：点击"开始截帧对比"，按字幕时间点自动截帧
6. **排名打标**：点击每个帧图下方的1/2/3按钮进行排名
7. **添加备注**：在备注列中输入对比说明
8. **导出文档**：点击"导出HTML文档"生成完整的对比报告

## 支持的链接格式

- 完整链接：`https://www.bilibili.com/video/BV1XkAne1Ew1/`
- BV号：`BV1XkAne1Ew1`
- 短链接：`https://b23.tv/xxxxx`

## 目录结构

```
bilibili-asr-tool/
├── server.js           # Node.js后端服务（Express）
├── index.html          # 前端页面（单文件SPA）
├── package.json        # Node.js依赖配置
├── .env                # 环境变量配置（需自行创建）
├── uploads/            # 临时上传文件目录
├── exports/            # 导出HTML文件目录
└── README.md           # 说明文档
```

## 部署

### 本地运行

```bash
node server.js
```

### VPS 部署（推荐）

1. 购买云服务器（如阿里云ECS）
2. 安装 Node.js、FFmpeg、Git
3. 克隆项目并安装依赖
4. 使用 systemd 创建系统服务，实现开机自启和自动重启

```bash
# 创建系统服务
cat > /etc/systemd/system/bilibili-asr.service << 'EOF'
[Unit]
Description=Bilibili ASR Tool
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/bilibili-asr-tool
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable bilibili-asr
systemctl start bilibili-asr
```

## 常见问题

**Q: 提示"该视频没有字幕或ASR文本"怎么办？**
A: 该视频UP主没有上传字幕，且B站没有生成ASR文本。需要设置B站登录Cookie后重试。

**Q: 截帧功能不可用？**
A: 需要安装FFmpeg并确保在系统PATH中。

**Q: 上传视频失败？**
A: 检查阿里云OSS配置是否正确，确保 `.env` 文件中的AccessKey和Bucket信息无误。

## 许可证

MIT License

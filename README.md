# B站视频ASR文本提取工具

一个简单易用的Web应用，可以快速提取B站视频的字幕和ASR（自动语音识别）文本。

## 功能特点

- 🎯 支持多种B站链接格式
- 📝 自动提取视频字幕文本
- 💻 美观的Web界面
- 📋 一键复制文本功能
- ⚡ 快速响应，操作简单

## 安装步骤

### 1. 安装Python依赖

确保你已经安装了Python 3.7或更高版本，然后运行：

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python app.py
```

### 3. 访问网站

在浏览器中打开：http://localhost:5000

## 使用方法

1. 在输入框中粘贴B站视频链接
2. 点击"提取文本"按钮
3. 等待几秒钟，即可看到视频信息和字幕文本
4. 点击"复制文本"按钮即可复制所有字幕内容

## 支持的链接格式

- 完整链接：`https://www.bilibili.com/video/BV1XkAne1Ew1/`
- BV号：`BV1XkAne1Ew1`
- 短链接：`https://b23.tv/xxxxx`

## 注意事项

- 仅支持有字幕的视频
- 某些视频可能没有ASR文本或字幕
- 需要网络连接才能访问B站API

## 技术栈

- 后端：Python + Flask
- 前端：HTML + CSS + JavaScript
- API：B站官方API

## 目录结构

```
B站视频下载/
├── app.py              # Flask后端服务
├── requirements.txt    # Python依赖
├── README.md          # 说明文档
└── templates/
    └── index.html     # 前端页面
```

## 常见问题

**Q: 提示"该视频没有字幕或ASR文本"怎么办？**
A: 这说明该视频UP主没有上传字幕，且B站也没有生成ASR文本。可以尝试其他视频。

**Q: 能否下载视频？**
A: 本工具仅提取字幕文本，不提供视频下载功能。

**Q: 支持批量提取吗？**
A: 目前仅支持单个视频提取，批量功能可以后续添加。

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

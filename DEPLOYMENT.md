# 部署指南

## 第1步：本地测试（可选）

```bash
npm install
node server.js
```

然后访问 http://localhost:5000

## 第2步：推送到 GitHub

由于网络连接问题，请手动执行：

```bash
# 进入项目目录
cd "C:\Users\baiyuzhuo\Desktop\B站视频下载"

# 查看git状态
git status

# 推送到GitHub（需要输入GitHub用户名和密码或Token）
git push -u origin main
```

如果询问密码，请生成 GitHub Personal Access Token：
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token"
3. 选择 "repo" 权限
4. 生成并复制Token
5. 粘贴作为密码

## 第3步：在 Vercel 上部署

1. 访问 https://vercel.com/import
2. 选择 "Import Git Repository"
3. 输入: `https://github.com/BAYMAX046/bilibili-asr-tool`
4. 点击 Import
5. 在 "Environment Variables" 页面添加以下变量：

| 变量名 | 值 |
|--------|-----|
| OSS_REGION | 你的阿里云地域（如oss-cn-shanghai） |
| OSS_ACCESS_KEY_ID | 你的 AccessKey ID |
| OSS_ACCESS_KEY_SECRET | 你的 AccessKey Secret |
| OSS_BUCKET | 你的 Bucket 名称 |

6. 点击 "Deploy"
7. 等待部署完成（通常 2-3 分钟）
8. 获取公网链接，例如：`https://bilibili-asr-tool.vercel.app`

## 部署完成

完成后，所有用户都可以访问：
```
https://bilibili-asr-tool.vercel.app
```

## 注意事项

- ❌ **不要**把 `.env` 文件上传到 GitHub（`.gitignore` 已经保护）
- ✅ 在 Vercel 中配置环境变量是安全的
- 💾 导出的 HTML 和上传的视频都保存在阿里云 OSS 中
- 🌍 不同地区的用户可以通过公网链接访问

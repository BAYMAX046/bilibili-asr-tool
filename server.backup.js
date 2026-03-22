const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 提取BV号
function extractBvid(url) {
    const patterns = [
        /BV[a-zA-Z0-9]+/,
        /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const bvid = match[0].startsWith('BV') ? match[0] : match[1];
            if (bvid.startsWith('BV')) {
                return bvid;
            }
        }
    }
    return null;
}

// 获取视频信息
async function getVideoInfo(bvid) {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com'
    };

    try {
        const response = await axios.get(url, { headers, timeout: 10000 });
        const data = response.data;

        if (data.code === 0) {
            const videoData = data.data;
            return {
                title: videoData.title,
                cid: videoData.cid,
                author: videoData.owner.name,
                duration: videoData.duration,
                desc: videoData.desc
            };
        }
    } catch (error) {
        console.error('获取视频信息失败:', error.message);
    }

    return null;
}

// 获取所有可用字幕列表
async function getAllSubtitles(bvid, cid, cookie = '') {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com'
    };

    if (cookie) {
        headers['Cookie'] = cookie;
    }

    try {
        const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        const data = response.data;

        console.log('Player V2 API返回:', data.code);

        if (data.code === 0 && data.data) {
            const subtitleInfo = data.data.subtitle || {};
            const subtitles = subtitleInfo.subtitles || [];

            console.log('找到字幕数量:', subtitles.length);

            if (subtitles.length > 0) {
                // 过滤有效字幕并添加元数据
                const validSubtitles = subtitles
                    .map((sub, index) => {
                        let subtitleUrl = sub.subtitle_url || '';
                        if (subtitleUrl && subtitleUrl.startsWith('//')) {
                            subtitleUrl = 'https:' + subtitleUrl;
                        }

                        return {
                            id: index,
                            lan: sub.lan || '',
                            lan_doc: sub.lan_doc || '未知语言',
                            subtitle_url: subtitleUrl,
                            is_ai: sub.lan && sub.lan.startsWith('ai-')
                        };
                    })
                    .filter(sub => sub.subtitle_url && sub.subtitle_url.trim() !== '');

                console.log('有效字幕数量:', validSubtitles.length);
                validSubtitles.forEach(sub => {
                    console.log(`  [${sub.id}] ${sub.lan_doc} (${sub.lan}) ${sub.is_ai ? '[AI]' : '[手动]'}`);
                });

                return validSubtitles;
            }
        }
    } catch (error) {
        console.error('获取字幕列表失败:', error.message);
    }

    return [];
}

// 下载单个字幕内容
async function downloadSubtitleContent(subtitleUrl, cookie = '') {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com'
    };

    if (cookie) {
        headers['Cookie'] = cookie;
    }

    try {
        console.log('下载字幕URL:', subtitleUrl);

        const response = await axios.get(subtitleUrl, { headers, timeout: 10000 });
        const subData = response.data;

        const bodyData = subData.body || [];
        console.log('字幕条目数:', bodyData.length);

        if (bodyData.length > 0) {
            console.log('前3条字幕:');
            bodyData.slice(0, Math.min(3, bodyData.length)).forEach((item, idx) => {
                console.log(`  [${idx}] ${item.from}s-${item.to}s: ${item.content}`);
            });
        }

        return {
            data: bodyData,
            text: formatSubtitleText(bodyData)
        };
    } catch (error) {
        console.error('下载字幕内容失败:', error.message);
        return null;
    }
}

// 格式化字幕文本
function formatSubtitleText(subtitleData) {
    if (!subtitleData) return "";

    const textLines = [];
    for (const item of subtitleData) {
        const text = (item.content || '').trim();
        if (text) {
            textLines.push(text);
        }
    }

    return textLines.join('\n');
}

// 主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API: 获取视频信息和字幕列表
app.post('/api/extract', async (req, res) => {
    try {
        const videoUrl = (req.body.url || '').trim();
        const cookie = (req.body.cookie || '').trim();

        if (!videoUrl) {
            return res.json({ success: false, error: '请提供B站视频链接' });
        }

        // 提取BV号
        const bvid = extractBvid(videoUrl);
        if (!bvid) {
            return res.json({ success: false, error: '无效的B站视频链接' });
        }

        // 获取视频信息
        const videoInfo = await getVideoInfo(bvid);
        if (!videoInfo) {
            return res.json({ success: false, error: '无法获取视频信息，请检查链接是否正确' });
        }

        // 获取所有字幕列表
        const subtitles = await getAllSubtitles(bvid, videoInfo.cid, cookie);

        if (subtitles.length > 0) {
            return res.json({
                success: true,
                bvid: bvid,
                video_info: videoInfo,
                subtitles: subtitles  // 返回所有字幕列表
            });
        } else {
            return res.json({
                success: false,
                error: '该视频没有字幕或ASR文本',
                bvid: bvid,
                video_info: videoInfo
            });
        }

    } catch (error) {
        return res.json({ success: false, error: `处理失败: ${error.message}` });
    }
});

// API: 下载指定字幕
app.post('/api/download-subtitle', async (req, res) => {
    try {
        const subtitleUrl = (req.body.subtitle_url || '').trim();
        const cookie = (req.body.cookie || '').trim();

        if (!subtitleUrl) {
            return res.json({ success: false, error: '请提供字幕URL' });
        }

        const result = await downloadSubtitleContent(subtitleUrl, cookie);

        if (result) {
            return res.json({
                success: true,
                text: result.text,
                data: result.data
            });
        } else {
            return res.json({
                success: false,
                error: '下载字幕失败'
            });
        }

    } catch (error) {
        return res.json({ success: false, error: `下载失败: ${error.message}` });
    }
});

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
    console.log('='.repeat(60));
    console.log('B站视频ASR文本提取工具 - Node.js版');
    console.log('='.repeat(60));
    console.log('✅ 服务启动成功！');
    console.log(`🌐 请在浏览器中访问: http://localhost:${PORT}`);
    console.log('按 Ctrl+C 停止服务');
    console.log('='.repeat(60));
});

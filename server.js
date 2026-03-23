const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const multer = require('multer');
const os = require('os');
const OSS = require('ali-oss');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 获取本机局域网IP
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过IPv6和内部地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// 初始化阿里云 OSS 客户端
let ossClient = null;
if (process.env.OSS_ACCESS_KEY_ID && process.env.OSS_ACCESS_KEY_SECRET) {
    ossClient = new OSS({
        region: process.env.OSS_REGION || 'oss-cn-shanghai',
        accessKeyId: process.env.OSS_ACCESS_KEY_ID,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
        bucket: process.env.OSS_BUCKET || 'asr-tool-bucket'
    });
}

// 中间件
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// 文件上传配置 - 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

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

// ============================================================
// FFmpeg精确截帧相关函数
// ============================================================

const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com'
};

let ffmpegAvailable = false;
let ffmpegPath = 'ffmpeg';

// 检测FFmpeg是否安装
function checkFfmpeg() {
    return new Promise((resolve) => {
        execFile('ffmpeg', ['-version'], { timeout: 5000 }, (error) => {
            if (!error) {
                ffmpegAvailable = true;
                ffmpegPath = 'ffmpeg';
                resolve(true);
                return;
            }
            // PATH中没找到，尝试固定安装路径
            const fixedPath = path.join(process.env.USERPROFILE || '', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');
            execFile(fixedPath, ['-version'], { timeout: 5000 }, (err2) => {
                if (!err2) {
                    ffmpegAvailable = true;
                    ffmpegPath = fixedPath;
                    console.log('📍 FFmpeg路径:', fixedPath);
                    resolve(true);
                } else {
                    ffmpegAvailable = false;
                    resolve(false);
                }
            });
        });
    });
}

// 获取B站视频播放地址
async function getVideoPlayUrl(bvid, cid, cookie = '') {
    const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=32&fnver=0&fourk=0`;
    const headers = { ...defaultHeaders };
    if (cookie) headers['Cookie'] = cookie;

    try {
        const response = await axios.get(url, { headers, timeout: 10000 });
        const data = response.data;

        if (data.code === 0 && data.data) {
            // 优先尝试DASH格式
            if (data.data.dash && data.data.dash.video && data.data.dash.video.length > 0) {
                const video = data.data.dash.video[0];
                const videoUrl = video.baseUrl || video.base_url;
                console.log('📹 获取到DASH视频流:', videoUrl.substring(0, 80) + '...');
                return videoUrl;
            }
            // 降级：durl格式（旧版）
            if (data.data.durl && data.data.durl.length > 0) {
                const videoUrl = data.data.durl[0].url;
                console.log('📹 获取到durl视频流:', videoUrl.substring(0, 80) + '...');
                return videoUrl;
            }
        }
        console.error('playurl返回异常:', data.code, data.message);
    } catch (error) {
        console.error('获取视频播放地址失败:', error.message);
    }
    return null;
}

// 用FFmpeg提取单帧
function extractFrame(videoUrl, timestamp) {
    return new Promise((resolve) => {
        const args = [
            '-headers', `Referer: https://www.bilibili.com\r\nUser-Agent: ${defaultHeaders['User-Agent']}\r\n`,
            '-ss', String(timestamp),
            '-i', videoUrl,
            '-frames:v', '1',
            '-vf', 'scale=480:-1',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '5',
            'pipe:1'
        ];

        execFile(ffmpegPath, args, {
            timeout: 15000,
            maxBuffer: 5 * 1024 * 1024,
            encoding: 'buffer'
        }, (error, stdout) => {
            if (error || !stdout || stdout.length < 100) {
                resolve(null);
            } else {
                resolve(stdout.toString('base64'));
            }
        });
    });
}

// 批量提取帧（并发控制）
async function extractFramesBatch(videoUrl, timestamps, onProgress) {
    const results = {};
    const uniqueTimestamps = [...new Set(timestamps.map(t => Math.round(t * 10) / 10))];
    const concurrency = 3;
    let completed = 0;

    console.log(`🎬 开始批量截帧: ${uniqueTimestamps.length}个时间点, 并发${concurrency}`);

    // 分批并发
    for (let i = 0; i < uniqueTimestamps.length; i += concurrency) {
        const batch = uniqueTimestamps.slice(i, i + concurrency);
        const promises = batch.map(async (ts) => {
            const base64 = await extractFrame(videoUrl, ts);
            completed++;
            if (onProgress) onProgress(completed, uniqueTimestamps.length);
            if (base64) {
                results[String(ts)] = base64;
            }
        });
        await Promise.all(promises);
    }

    console.log(`✅ 截帧完成: 成功${Object.keys(results).length}/${uniqueTimestamps.length}`);
    return results;
}

// 从本地文件提取单帧（无需网络headers，更快）
function extractFrameFromLocal(filePath, timestamp) {
    return new Promise((resolve) => {
        const args = [
            '-ss', String(timestamp),
            '-i', filePath,
            '-frames:v', '1',
            '-vf', 'scale=480:-1',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '5',
            'pipe:1'
        ];

        execFile(ffmpegPath, args, {
            timeout: 15000,
            maxBuffer: 5 * 1024 * 1024,
            encoding: 'buffer'
        }, (error, stdout) => {
            if (error || !stdout || stdout.length < 100) {
                resolve(null);
            } else {
                resolve(stdout.toString('base64'));
            }
        });
    });
}

// 批量从本地文件提取帧
async function extractLocalFramesBatch(filePath, timestamps) {
    const results = {};
    const uniqueTimestamps = [...new Set(timestamps.map(t => Math.round(t * 10) / 10))];
    const concurrency = 3;
    let completed = 0;

    console.log(`🎬 本地文件批量截帧: ${uniqueTimestamps.length}个时间点`);

    for (let i = 0; i < uniqueTimestamps.length; i += concurrency) {
        const batch = uniqueTimestamps.slice(i, i + concurrency);
        const promises = batch.map(async (ts) => {
            const base64 = await extractFrameFromLocal(filePath, ts);
            completed++;
            if (base64) results[String(ts)] = base64;
        });
        await Promise.all(promises);
    }

    console.log(`✅ 本地截帧完成: 成功${Object.keys(results).length}/${uniqueTimestamps.length}`);
    return results;
}

// API: 上传视频文件
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.json({ success: false, error: '未收到文件' });
    }

    try {
        // 生成OSS上的文件名
        const fileName = `uploads/${Date.now()}-${req.file.originalname}`;

        // 上传到阿里云OSS
        if (ossClient) {
            await ossClient.put(fileName, req.file.buffer);
            const ossUrl = `${ossClient.getObjectUrl(fileName)}`;
            console.log(`📁 文件上传到OSS成功: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);
            return res.json({
                success: true,
                filePath: ossUrl,
                fileName: req.file.originalname,
                ossKey: fileName
            });
        } else {
            // OSS未配置，使用内存URL（仅限开发环境）
            const memoryUrl = `data:video/mp4;base64,${req.file.buffer.toString('base64')}`.substring(0, 100) + '...';
            return res.json({
                success: true,
                filePath: memoryUrl,
                fileName: req.file.originalname,
                buffer: req.file.buffer.toString('base64')
            });
        }
    } catch (error) {
        console.error('❌ 上传失败:', error.message);
        return res.json({ success: false, error: '上传失败: ' + error.message });
    }
});

// API: 清理上传文件
app.delete('/api/uploaded-files', (req, res) => {
    const { filePaths } = req.body;
    if (filePaths && Array.isArray(filePaths)) {
        for (const fp of filePaths) {
            try {
                if (fs.existsSync(fp) && fp.includes('uploads')) {
                    fs.unlinkSync(fp);
                    console.log(`🗑 清理文件: ${fp}`);
                }
            } catch (e) { /* ignore */ }
        }
    }
    return res.json({ success: true });
});

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

// API: FFmpeg精确截帧（支持多视频源）
app.post('/api/videoshot', async (req, res) => {
    try {
        const { bvid, cid, subtitleTimestamps, cookie, localFilePaths } = req.body;
        if (!bvid || !cid) {
            return res.json({ success: false, error: '缺少bvid或cid' });
        }

        if (!ffmpegAvailable) {
            const message = process.env.VERCEL
                ? '☁️ 云端部署不支持截帧功能（需要 FFmpeg）。请在本地版本中使用此功能。'
                : '❌ FFmpeg 未安装，无法截帧。请安装 FFmpeg：https://www.gyan.dev/ffmpeg/builds/';
            return res.json({ success: false, error: message });
        }

        if (!subtitleTimestamps || subtitleTimestamps.length === 0) {
            return res.json({ success: false, error: '没有字幕时间戳' });
        }

        console.log(`🎬 FFmpeg截帧: ${bvid}, ${subtitleTimestamps.length}个时间点, 本地文件${(localFilePaths || []).length}个`);

        // 1. B站视频截帧
        let biliFrames = {};
        const videoUrl = await getVideoPlayUrl(bvid, cid, cookie);
        if (videoUrl) {
            biliFrames = await extractFramesBatch(videoUrl, subtitleTimestamps);
        } else {
            console.warn('⚠️ 无法获取B站视频流，跳过B站截帧');
        }

        // 2. 本地文件截帧
        const localResults = [];
        if (localFilePaths && localFilePaths.length > 0) {
            for (const localFile of localFilePaths) {
                if (fs.existsSync(localFile.filePath)) {
                    console.log(`📁 本地文件截帧: ${localFile.fileName}`);
                    const frames = await extractLocalFramesBatch(localFile.filePath, subtitleTimestamps);
                    localResults.push({ fileName: localFile.fileName, frames });
                } else {
                    console.warn(`⚠️ 文件不存在: ${localFile.filePath}`);
                    localResults.push({ fileName: localFile.fileName, frames: {} });
                }
            }
        }

        return res.json({
            success: true,
            biliFrames,
            localFrames: localResults
        });

    } catch (error) {
        console.error('截帧失败:', error.message);
        return res.json({ success: false, error: `截帧失败: ${error.message}` });
    }
});

// API: 导出HTML文档（多视频截帧对照+排名+GSB+备注）
app.post('/api/export-html', async (req, res) => {
    try {
        const { title, author, bvid, subtitleItems, biliFrames, localFrames, rankings, videoNames, videoColumnNames, notes, gsbSummary, bestPerRow, summary } = req.body;

        if (!subtitleItems || subtitleItems.length === 0) {
            return res.json({ success: false, error: '没有字幕数据' });
        }

        console.log(`导出HTML: ${title}, ${subtitleItems.length}条字幕, ${(localFrames || []).length}个本地视频`);

        // 使用自定义列名（如果有）
        const videoKeys = ['bili', ...(localFrames || []).map((_, i) => `local${i + 1}`)];
        const defaultNames = ['B站视频', ...(videoNames || [])];
        const allVideoNames = videoKeys.map((key, i) => (videoColumnNames && videoColumnNames[key]) || defaultNames[i] || '视频');
        const videoCount = allVideoNames.length;
        const colWidth = videoCount <= 2 ? '400px' : videoCount <= 3 ? '300px' : '250px';

        // GSB摘要
        let gsbHtml = '';
        if (gsbSummary && gsbSummary.length > 0) {
            const gsbRows = gsbSummary.map(g =>
                `<div style="margin:4px 0;font-size:15px;">
                    <strong>${escapeHtml(g.nameA)}</strong> : <strong>${escapeHtml(g.nameB)}</strong> =
                    <span style="color:#4CAF50;font-weight:bold;">${g.good}</span> :
                    <span style="color:#999;font-weight:bold;">${g.same}</span> :
                    <span style="color:#f44336;font-weight:bold;">${g.bad}</span>
                    <span style="color:#999;font-size:12px;margin-left:8px;">(Good : Same : Bad)</span>
                </div>`
            ).join('');
            gsbHtml = `<div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #667eea;">
                <div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">GSB 对比总结</div>
                ${gsbRows}
            </div>`;
        }

        // 用户总结
        let summaryHtml = '';
        if (summary && summary.trim() !== '') {
            summaryHtml = `<div style="background:#fff3e0;border-radius:8px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #ff9800;">
                <div style="font-size:16px;font-weight:600;color:#333;margin-bottom:8px;">📝 截帧总结</div>
                <div style="font-size:14px;color:#555;line-height:1.8;white-space:pre-wrap;">${escapeHtml(summary)}</div>
            </div>`;
        }

        // 生成列头
        const thStyle = 'padding:8px 10px;text-align:center;font-size:13px;color:#667eea;border-bottom:2px solid #667eea;';
        const headerCols = allVideoNames.map(name =>
            `<th style="${thStyle}">${escapeHtml(name)}</th>`
        ).join('');
        const rankingHeader = rankings && Object.keys(rankings).length > 0 ? `<th style="${thStyle}">排名</th>` : '';
        const bestHeader = `<th style="${thStyle}">Best</th>`;
        const notesHeader = notes && Object.keys(notes).length > 0 ? `<th style="${thStyle}">备注</th>` : '';

        // 生成每行
        const rows = subtitleItems.map((item, idx) => {
            const timeStr = formatTimeStr(item.from);
            const tsKey = String(Math.round(item.from * 10) / 10);

            // 文案列
            let row = `<td style="padding:10px;vertical-align:top;border-bottom:1px solid #f0f0f0;width:180px;">
                <span style="font-size:12px;color:#999;font-family:monospace;">${timeStr}</span><br>
                <span style="font-size:14px;color:#333;line-height:1.6;">${escapeHtml(item.content)}</span>
            </td>`;

            // B站帧列
            const biliFrame = biliFrames && biliFrames[tsKey];
            row += makeFrameTd(biliFrame, colWidth);

            // 本地视频帧列
            if (localFrames) {
                for (const lf of localFrames) {
                    const frame = lf.frames && lf.frames[tsKey];
                    row += makeFrameTd(frame, colWidth);
                }
            }

            // 排名列
            const rowRanking = rankings && rankings[idx];
            if (rankings && Object.keys(rankings).length > 0) {
                if (rowRanking) {
                    const badges = allVideoNames.map((name, vi) => {
                        const key = videoKeys[vi];
                        const rank = rowRanking[key];
                        if (!rank) return '';
                        const colors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
                        const color = colors[rank] || '#999';
                        return `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${color};color:#fff;font-size:12px;font-weight:bold;margin:2px;">${rank}</span>`;
                    }).join(' ');
                    row += `<td style="padding:10px;vertical-align:middle;text-align:center;border-bottom:1px solid #f0f0f0;">${badges}</td>`;
                } else {
                    row += `<td style="padding:10px;vertical-align:middle;text-align:center;border-bottom:1px solid #f0f0f0;">-</td>`;
                }
            }

            // Best列
            const bestText = bestPerRow && bestPerRow[idx] ? escapeHtml(bestPerRow[idx]) : '-';
            row += `<td style="padding:10px;vertical-align:middle;text-align:center;border-bottom:1px solid #f0f0f0;font-weight:600;color:#667eea;">${bestText}</td>`;

            // 备注列
            if (notes && Object.keys(notes).length > 0) {
                const noteText = notes[idx] ? escapeHtml(notes[idx]) : '';
                row += `<td style="padding:10px;vertical-align:middle;text-align:center;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;max-width:200px;word-break:break-word;">${noteText}</td>`;
            }

            return `<tr>${row}</tr>`;
        }).join('\n');

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - 多视频截帧对照</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 30px; overflow-x: auto; }
        h1 { font-size: 22px; color: #333; margin-bottom: 8px; }
        .meta { color: #666; font-size: 14px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #667eea; }
        table { width: 100%; border-collapse: collapse; }
        img { border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
            UP主: ${escapeHtml(author || '未知')} | BV号: ${escapeHtml(bvid || '')} |
            <span style="color:#667eea;font-weight:600;">${subtitleItems.length} 条字幕</span> |
            生成时间: ${new Date().toLocaleString('zh-CN')}
        </div>
        ${gsbHtml}
        <div style="margin-bottom:20px;">
            <h2 style="font-size:18px;color:#333;margin-bottom:12px;border-bottom:2px solid #667eea;padding-bottom:8px;">📹 截帧对照</h2>
            ${summaryHtml}
            <table>
                <thead><tr>
                    <th style="padding:8px;text-align:left;font-size:13px;color:#667eea;border-bottom:2px solid #667eea;">口播文案</th>
                    ${headerCols}
                    ${rankingHeader}
                    ${bestHeader}
                    ${notesHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>
</body>
</html>`;

        // 保存到OSS或本地并生成可分享链接
        const exportId = Date.now() + '_' + Math.random().toString(36).substring(7);

        try {
            let shareUrl = null;

            if (ossClient) {
                // 上传到阿里云OSS
                const ossKey = `exports/${exportId}.html`;
                await ossClient.put(ossKey, Buffer.from(html, 'utf-8'), {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8'
                    }
                });
                shareUrl = ossClient.getObjectUrl(ossKey);
                console.log(`✅ HTML已保存到OSS: ${ossKey}`);
                console.log(`🔗 分享链接: ${shareUrl}`);
            } else {
                // 本地保存（仅限开发环境）
                const exportsDir = path.join(__dirname, 'exports');
                if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
                const exportPath = path.join(exportsDir, `${exportId}.html`);
                fs.writeFileSync(exportPath, html);
                const localIp = getLocalIp();
                shareUrl = `http://${localIp}:${PORT}/share/${exportId}`;
                console.log(`✅ HTML已保存: ${exportPath}`);
                console.log(`🔗 分享链接: ${shareUrl}`);
            }

            return res.json({ success: true, html, shareUrl, exportId });
        } catch (err) {
            console.warn('保存HTML失败，返回下载版本:', err.message);
            return res.json({ success: true, html }); // 降级方案：只返回HTML内容用于下载
        }

    } catch (error) {
        console.error('导出HTML失败:', error.message);
        return res.json({ success: false, error: `导出失败: ${error.message}` });
    }
});

function makeFrameTd(frameBase64, colWidth) {
    if (frameBase64) {
        // 支持多种图片格式的 base64（如果已经有 data: URI 前缀则保持，否则默认 JPEG）
        const imgSrc = frameBase64.startsWith('data:') ? frameBase64 : `data:image/jpeg;base64,${frameBase64}`;
        return `<td style="padding:5px;text-align:center;border-bottom:1px solid #f0f0f0;"><img src="${imgSrc}" style="width:${colWidth};height:auto;border-radius:4px;"></td>`;
    }
    return `<td style="padding:5px;text-align:center;border-bottom:1px solid #f0f0f0;"><div style="width:${colWidth};height:150px;background:#f0f0f0;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">无截帧</div></td>`;
}

// 辅助函数：秒数转时间字符串
function formatTimeStr(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 路由：列出所有导出的文档
app.get('/exports/', (req, res) => {
    const exportsDir = path.join(__dirname, 'exports');

    fs.readdir(exportsDir, (err, files) => {
        if (err) {
            return res.status(404).send('导出目录不存在');
        }

        const htmlFiles = files.filter(f => f.endsWith('.html')).sort().reverse();

        let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>截帧对照文档列表</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); padding: 40px; }
        h1 { color: #333; margin-bottom: 8px; font-size: 28px; }
        .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
        .file-list { display: grid; gap: 12px; }
        .file-item { padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea; transition: all 0.2s; cursor: pointer; }
        .file-item:hover { background: #e8ecf8; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2); }
        .file-item a { color: #667eea; text-decoration: none; font-weight: 500; font-size: 15px; }
        .file-item .time { color: #999; font-size: 12px; margin-top: 6px; }
        .empty { text-align: center; color: #999; padding: 40px 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📄 截帧对照文档列表</h1>
        <p class="subtitle">点击下方链接即可在线查看</p>
        <div class="file-list">`;

        if (htmlFiles.length === 0) {
            html += '<div class="empty">暂无导出文档</div>';
        } else {
            htmlFiles.forEach(file => {
                const fileId = file.replace('.html', '');
                const timestamp = parseInt(fileId.split('_')[0]);
                const date = new Date(timestamp).toLocaleString('zh-CN');
                html += `<div class="file-item">
                    <a href="/share/${fileId}" target="_blank">📺 ${date}</a>
                    <div class="time">${file}</div>
                </div>`;
            });
        }

        html += `</div></div></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    });
});

// 路由：分享导出的HTML文档
app.get('/share/:exportId', (req, res) => {
    const { exportId } = req.params;
    const filePath = path.join(__dirname, 'exports', `${exportId}.html`);

    // 验证文件路径安全性
    if (!filePath.startsWith(path.join(__dirname, 'exports'))) {
        return res.status(403).send('Access denied');
    }

    fs.stat(filePath, (err) => {
        if (err) {
            return res.status(404).send('文档不存在或已过期');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(filePath).pipe(res);
    });
});

// 辅助函数：HTML转义
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 启动服务器
async function startServer() {
    // 检测FFmpeg（Vercel上可能不可用）
    const hasFFmpeg = await checkFfmpeg();

    // Vercel 需要监听所有地址
    const host = process.env.VERCEL ? '0.0.0.0' : '127.0.0.1';

    app.listen(PORT, host, () => {
        console.log('='.repeat(60));
        console.log('B站视频ASR文本提取工具 - Node.js版');
        console.log('='.repeat(60));
        console.log('✅ 服务启动成功！');
        console.log(`🌐 请在浏览器中访问: http://localhost:${PORT}`);
        if (hasFFmpeg) {
            console.log('🎬 FFmpeg 已检测到 — 精确截帧功能可用');
        } else {
            console.log('⚠️  FFmpeg 未安装 — 截帧功能不可用（字幕功能正常）');
            if (!process.env.VERCEL) {
                console.log('   安装方法: 下载 https://www.gyan.dev/ffmpeg/builds/ 并加入PATH');
            }
        }
        console.log('按 Ctrl+C 停止服务');
        console.log('='.repeat(60));
    });
}

// 本地运行
if (!process.env.VERCEL) {
    startServer();
}

// Vercel 无服务器函数导出
module.exports = app;

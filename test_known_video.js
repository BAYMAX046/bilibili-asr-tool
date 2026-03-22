const axios = require('axios');

// 测试几个可能有字幕的热门视频
const testVideos = [
    'BV1xx411c7mu',  // 热门科普视频
    'BV1GJ411x7h7',  // 经典视频
    'BV1uT4y1P7CX',  // 可能有字幕
];

async function testVideo(bvid) {
    try {
        console.log(`\n测试 ${bvid}...`);
        
        // 获取视频信息
        const videoRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        if (videoRes.data.code !== 0) {
            console.log('  视频不存在或无法访问');
            return;
        }
        
        const video = videoRes.data.data;
        console.log('  标题:', video.title.substring(0, 30) + '...');
        
        // 获取字幕
        const subRes = await axios.get(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${video.cid}`);
        const subtitles = subRes.data.data?.subtitle?.subtitles || [];
        
        if (subtitles.length > 0) {
            console.log('  ✅ 有字幕！语言:', subtitles.map(s => s.lan_doc).join(', '));
            return bvid;
        } else {
            console.log('  ❌ 没有字幕');
        }
    } catch (e) {
        console.log('  错误:', e.message);
    }
    return null;
}

async function main() {
    console.log('正在测试哪些视频有字幕...');
    console.log('='.repeat(60));
    
    for (const bvid of testVideos) {
        const result = await testVideo(bvid);
        if (result) {
            console.log('\n找到有字幕的视频:', result);
            console.log('测试链接: https://www.bilibili.com/video/' + result);
            break;
        }
    }
}

main();

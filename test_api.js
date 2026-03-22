const axios = require('axios');

async function test() {
    const bvid = 'BV1Py6vBrEeD';
    
    console.log('测试BV号:', bvid);
    console.log('='.repeat(60));
    
    // 1. 获取视频信息
    console.log('1. 获取视频信息...');
    try {
        const videoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const videoRes = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com'
            }
        });
        
        console.log('视频信息返回码:', videoRes.data.code);
        if (videoRes.data.code === 0) {
            const video = videoRes.data.data;
            console.log('标题:', video.title);
            console.log('CID:', video.cid);
            console.log('UP主:', video.owner.name);
            
            // 2. 获取字幕信息
            console.log('\n2. 获取字幕信息...');
            const subUrl = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${video.cid}`;
            const subRes = await axios.get(subUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.bilibili.com'
                }
            });
            
            console.log('字幕API返回码:', subRes.data.code);
            console.log('字幕数据:', JSON.stringify(subRes.data.data?.subtitle, null, 2));
        }
    } catch (error) {
        console.error('错误:', error.message);
    }
}

test();

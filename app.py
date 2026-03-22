from flask import Flask, render_template, request, jsonify
import requests
import re
import json

app = Flask(__name__)

def extract_bvid(url):
    """从B站链接中提取BV号"""
    patterns = [
        r'BV[a-zA-Z0-9]+',
        r'bilibili\.com/video/(BV[a-zA-Z0-9]+)',
        r'b23\.tv/([a-zA-Z0-9]+)'
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            bvid = match.group(0) if 'BV' in match.group(0) else match.group(1)
            if bvid.startswith('BV'):
                return bvid
    return None

def get_video_info(bvid):
    """获取视频基本信息"""
    url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()

        if data['code'] == 0:
            video_data = data['data']
            return {
                'title': video_data['title'],
                'cid': video_data['cid'],
                'author': video_data['owner']['name'],
                'duration': video_data['duration'],
                'desc': video_data['desc']
            }
    except Exception as e:
        print(f"获取视频信息失败: {e}")

    return None

def get_subtitle(bvid, cid):
    """获取视频字幕"""
    url = f"https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()

        if data['code'] == 0 and 'data' in data:
            subtitle_info = data['data'].get('subtitle', {})
            subtitles = subtitle_info.get('subtitles', [])

            if subtitles:
                # 获取第一个字幕（通常是中文）
                subtitle_url = subtitles[0]['subtitle_url']
                if subtitle_url.startswith('//'):
                    subtitle_url = 'https:' + subtitle_url

                # 下载字幕内容
                sub_response = requests.get(subtitle_url, headers=headers, timeout=10)
                sub_data = sub_response.json()

                return {
                    'type': 'subtitle',
                    'data': sub_data.get('body', []),
                    'lang': subtitles[0].get('lan_doc', '中文')
                }
    except Exception as e:
        print(f"获取字幕失败: {e}")

    return None

def format_subtitle_text(subtitle_data):
    """格式化字幕文本"""
    if not subtitle_data:
        return ""

    text_lines = []
    for item in subtitle_data:
        text = item.get('content', '').strip()
        if text:
            text_lines.append(text)

    return '\n'.join(text_lines)

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/extract', methods=['POST'])
def extract_asr():
    """提取ASR文本API"""
    try:
        data = request.get_json()
        video_url = data.get('url', '').strip()

        if not video_url:
            return jsonify({'success': False, 'error': '请提供B站视频链接'})

        # 提取BV号
        bvid = extract_bvid(video_url)
        if not bvid:
            return jsonify({'success': False, 'error': '无效的B站视频链接'})

        # 获取视频信息
        video_info = get_video_info(bvid)
        if not video_info:
            return jsonify({'success': False, 'error': '无法获取视频信息，请检查链接是否正确'})

        # 获取字幕
        subtitle = get_subtitle(bvid, video_info['cid'])

        if subtitle:
            text = format_subtitle_text(subtitle['data'])
            return jsonify({
                'success': True,
                'bvid': bvid,
                'video_info': video_info,
                'subtitle': {
                    'text': text,
                    'lang': subtitle['lang'],
                    'data': subtitle['data']
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': '该视频没有字幕或ASR文本',
                'bvid': bvid,
                'video_info': video_info
            })

    except Exception as e:
        return jsonify({'success': False, 'error': f'处理失败: {str(e)}'})

if __name__ == '__main__':
    print("=" * 60)
    print("B站视频ASR文本提取工具")
    print("=" * 60)
    print("正在启动服务...")

    # 尝试使用waitress（更快）
    try:
        from waitress import serve
        print("服务启动成功！")
        print("请在浏览器中访问: http://localhost:5000")
        print("按 Ctrl+C 停止服务")
        print("=" * 60)
        serve(app, host='127.0.0.1', port=5000, threads=4)
    except ImportError:
        # 如果没有waitress，使用Flask内置服务器
        print("服务启动成功！")
        print("请在浏览器中访问: http://localhost:5000")
        print("=" * 60)
        app.run(debug=False, host='127.0.0.1', port=5000, threaded=True)

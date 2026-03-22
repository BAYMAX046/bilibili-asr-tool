#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B站视频ASR文本提取工具 - 命令行版本
用法: python extract.py <B站视频链接或BV号>
"""
import requests
import re
import sys

def extract_bvid(url):
    """从B站链接中提取BV号"""
    patterns = [
        r'BV[a-zA-Z0-9]+',
        r'bilibili\.com/video/(BV[a-zA-Z0-9]+)',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
            }
    except Exception as e:
        print(f"❌ 获取视频信息失败: {e}")
    return None

def get_subtitle(bvid, cid):
    """获取视频字幕"""
    url = f"https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com'
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()
        if data['code'] == 0 and 'data' in data:
            subtitle_info = data['data'].get('subtitle', {})
            subtitles = subtitle_info.get('subtitles', [])
            if subtitles:
                subtitle_url = subtitles[0]['subtitle_url']
                if subtitle_url.startswith('//'):
                    subtitle_url = 'https:' + subtitle_url
                sub_response = requests.get(subtitle_url, headers=headers, timeout=10)
                sub_data = sub_response.json()
                return {
                    'data': sub_data.get('body', []),
                    'lang': subtitles[0].get('lan_doc', '中文')
                }
    except Exception as e:
        print(f"❌ 获取字幕失败: {e}")
    return None

def main():
    print("=" * 60)
    print("B站视频ASR文本提取工具 - 命令行版")
    print("=" * 60)

    if len(sys.argv) < 2:
        print("\n用法: python extract.py <B站视频链接或BV号>")
        print("\n示例:")
        print("  python extract.py BV1XkAne1Ew1")
        print("  python extract.py https://www.bilibili.com/video/BV1XkAne1Ew1/")
        sys.exit(1)

    video_url = sys.argv[1]
    print(f"\n🔍 正在处理: {video_url}")

    # 提取BV号
    bvid = extract_bvid(video_url)
    if not bvid:
        print("❌ 无效的B站视频链接")
        sys.exit(1)

    print(f"✓ BV号: {bvid}")

    # 获取视频信息
    print("📹 正在获取视频信息...")
    video_info = get_video_info(bvid)
    if not video_info:
        print("❌ 无法获取视频信息")
        sys.exit(1)

    print(f"✓ 标题: {video_info['title']}")
    print(f"✓ UP主: {video_info['author']}")

    # 获取字幕
    print("📝 正在获取字幕...")
    subtitle = get_subtitle(bvid, video_info['cid'])

    if not subtitle:
        print("❌ 该视频没有字幕或ASR文本")
        sys.exit(1)

    print(f"✓ 字幕语言: {subtitle['lang']}")
    print("=" * 60)
    print("字幕内容:")
    print("=" * 60)

    # 输出字幕
    for item in subtitle['data']:
        text = item.get('content', '').strip()
        if text:
            print(text)

    print("=" * 60)
    print("✅ 提取完成！")

    # 保存到文件
    filename = f"{bvid}_subtitle.txt"
    with open(filename, 'w', encoding='utf-8') as f:
        for item in subtitle['data']:
            text = item.get('content', '').strip()
            if text:
                f.write(text + '\n')
    print(f"💾 已保存到文件: {filename}")

if __name__ == '__main__':
    main()

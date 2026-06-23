from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import subprocess
import os
import json
import uuid
import glob

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), 'downloads')
CLIPS_DIR = os.path.join(os.path.dirname(__file__), 'clips')

os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(CLIPS_DIR, exist_ok=True)


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/download', methods=['POST'])
def download_video():
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL manquante'}), 400

    video_id = str(uuid.uuid4())[:8]
    output_template = os.path.join(DOWNLOADS_DIR, f'{video_id}.%(ext)s')

    try:
        # Get video info first
        info_cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-playlist',
            '--cookies', '/app/cookies.txt',
            url
        ]
        info_result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=30)

        if info_result.returncode != 0:
            return jsonify({'error': 'Impossible d\'accéder à cette vidéo. Vérifiez le lien.'}), 400

        info = json.loads(info_result.stdout)
        title = info.get('title', 'video')
        duration = info.get('duration', 0)
        platform = info.get('extractor_key', 'Unknown')

        # Download + re-encode H264 pour compatibilité navigateur
        raw_template = os.path.join(DOWNLOADS_DIR, f'{video_id}_raw.%(ext)s')
        final_path = os.path.join(DOWNLOADS_DIR, f'{video_id}.mp4')

        dl_cmd = [
            'yt-dlp',
            '-f', 'bestvideo+bestaudio/best',
            '--no-playlist',
            '--cookies', '/app/cookies.txt',
            '-o', raw_template,
            '--merge-output-format', 'mp4',
            url
        ]
        dl_result = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=600)

        if dl_result.returncode != 0:
            return jsonify({'error': 'Échec du téléchargement. La vidéo est peut-être privée.'}), 400

        # Find raw downloaded file
        raw_files = glob.glob(os.path.join(DOWNLOADS_DIR, f'{video_id}_raw.*'))
        if not raw_files:
            return jsonify({'error': 'Fichier introuvable après téléchargement'}), 500

        raw_path = raw_files[0]

        # Re-encode to H264 + AAC for browser compatibility
        encode_cmd = [
            'ffmpeg',
            '-i', raw_path,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-y',
            final_path
        ]
        encode_result = subprocess.run(encode_cmd, capture_output=True, text=True, timeout=600)

        # Cleanup raw file
        if os.path.exists(raw_path):
            os.remove(raw_path)

        if encode_result.returncode != 0 or not os.path.exists(final_path):
            return jsonify({'error': 'Erreur lors de la conversion vidéo'}), 500

        filename = f'{video_id}.mp4'

        return jsonify({
            'success': True,
            'video_id': video_id,
            'filename': filename,
            'title': title,
            'duration': duration,
            'platform': platform,
            'preview_url': f'/api/preview/{filename}'
        })

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timeout : vidéo trop longue ou connexion lente'}), 408
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/preview/<filename>')
def preview_video(filename):
    path = os.path.join(DOWNLOADS_DIR, filename)
    if not os.path.exists(path):
        return jsonify({'error': 'Fichier introuvable'}), 404
    return send_file(path, mimetype='video/mp4', conditional=True)


@app.route('/api/clip', methods=['POST'])
def clip_video():
    data = request.get_json()
    filename = data.get('filename')
    segments = data.get('segments', [])

    if not filename or not segments:
        return jsonify({'error': 'Données manquantes'}), 400

    source_path = os.path.join(DOWNLOADS_DIR, filename)
    if not os.path.exists(source_path):
        return jsonify({'error': 'Vidéo source introuvable'}), 404

    clips = []

    for i, seg in enumerate(segments):
        start = seg.get('start', '0')
        end = seg.get('end', '')
        label = seg.get('label', f'clip_{i+1}')

        clip_id = str(uuid.uuid4())[:8]
        base_name = os.path.splitext(filename)[0]
        clip_filename = f'{base_name}_{label}_{clip_id}.mp4'
        clip_path = os.path.join(CLIPS_DIR, clip_filename)

        cmd = [
            'ffmpeg',
            '-i', source_path,
            '-ss', str(start),
        ]

        if end:
            cmd += ['-to', str(end)]

        cmd += [
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-y',
            clip_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode == 0 and os.path.exists(clip_path):
            size = os.path.getsize(clip_path)
            clips.append({
                'filename': clip_filename,
                'label': label,
                'start': start,
                'end': end,
                'size': size,
                'download_url': f'/api/clips/{clip_filename}'
            })
        else:
            clips.append({
                'label': label,
                'error': 'Échec du découpage pour ce segment'
            })

    return jsonify({'success': True, 'clips': clips})


@app.route('/api/clips/<filename>')
def download_clip(filename):
    path = os.path.join(CLIPS_DIR, filename)
    if not os.path.exists(path):
        return jsonify({'error': 'Clip introuvable'}), 404
    return send_file(path, as_attachment=True, download_name=filename)


@app.route('/api/cleanup', methods=['POST'])
def cleanup():
    data = request.get_json()
    filename = data.get('filename')
    if filename:
        path = os.path.join(DOWNLOADS_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
    return jsonify({'success': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

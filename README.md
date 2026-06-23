# ClipTool — Personal Video Clipper

Outil perso pour télécharger et découper des vidéos depuis YouTube, TikTok, Instagram, etc.

## Stack
- Python + Flask (backend)
- yt-dlp (téléchargement)
- FFmpeg (découpage)
- HTML/CSS/JS vanilla (frontend)

---

## Lancement local

### Prérequis
```bash
# Installer FFmpeg
# macOS:
brew install ffmpeg

# Ubuntu/Debian:
sudo apt install ffmpeg

# Windows: télécharge depuis https://ffmpeg.org/download.html
```

### Installer & lancer
```bash
cd cliptool
pip install -r requirements.txt
python app.py
```

Ouvre http://localhost:5000

---

## Déploiement Railway

1. Crée un compte sur [railway.app](https://railway.app)
2. Nouveau projet → Deploy from GitHub repo
3. Ajoute un fichier `Procfile` :
```
web: python app.py
```
4. Dans les variables d'environnement Railway : rien de spécial requis
5. Railway détecte Python automatiquement

**Note :** Railway installe FFmpeg via buildpacks. Ajoute un fichier `nixpacks.toml` :
```toml
[phases.setup]
nixPkgs = ["ffmpeg", "python311"]
```

---

## Déploiement Render

1. Crée un compte sur [render.com](https://render.com)
2. New Web Service → connecte ton repo GitHub
3. Build Command : `pip install -r requirements.txt`
4. Start Command : `python app.py`
5. Ajoute une variable d'environnement : `PORT=10000`

Pour FFmpeg sur Render, ajoute `Dockerfile` :
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "app.py"]
```

---

## Usage
1. Colle un lien vidéo (YouTube, TikTok, Instagram...)
2. La vidéo se charge dans le player
3. Définis les segments (début → fin)
4. Clique Découper → télécharge tes clips

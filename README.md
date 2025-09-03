中文说明（Video Compression Service）
=================================

项目简介
--------
这是一个基于 Flask + FFmpeg 的视频压缩服务，提供网页界面与 REST API。后台任务采用 Celery：
- 未配置消息队列（未设置 `CELERY_BROKER_URL`）时，自动使用内存代理并以“同步/eager”模式执行，便于快速试用。
- 配置了 Redis 等消息队列后，任务改为真正异步，由独立的 Celery Worker 执行。

关键文件
--------
- `app/main.py`：Flask 应用与 API 路由
- `app/tasks.py`：视频压缩任务（调用 FFmpeg）
- `app/celery_worker.py`：Celery 实例工厂（未配置时启用内存 + eager 模式）
- `app/config.py`：默认输入/输出目录与登录配置
- `templates/`：前端页面模板
- `static/`：前端脚本与样式
- `logs/compress_log.jsonl`：压缩日志（逐行 JSON）

本地运行
--------
1) 安装依赖

```bash
pip install -r requirements.txt
```

2) 设置环境变量（至少如下）
- `SECRET_KEY`：Flask 会话密钥（随机字符串）
- 登录账户（二选一）
  - 明文：`ADMIN_USERNAME` 与 `ADMIN_PASSWORD`
  - 或哈希：`ADMIN_USERNAME` 与 `ADMIN_PASSWORD_HASH`（优先）

生成密码哈希（可选）：

```bash
python -c "from werkzeug.security import generate_password_hash as g; print(g('你的密码'))"
```

3) 必须安装 FFmpeg
- 确保 `ffmpeg` 和 `ffprobe` 在 PATH：`ffmpeg -version` / `ffprobe -version`

4) 启动

```bash
# 调试
python app/main.py

# 或更接近生产
gunicorn -w 2 -k gthread -b 0.0.0.0:5001 app.main:app
```

API 速览
--------
- `GET /api/dirs`：获取输入/输出目录
- `POST /api/dirs`：设置输入/输出目录
- `GET /api/input_videos`：列出输入目录下的视频
- `POST /api/compress`：提交压缩任务
- `GET /api/tasks`：任务状态与进度
- `GET /api/logs`：压缩日志数据

任务执行模式
------------
- 无 `CELERY_BROKER_URL`：内存 + eager，同步执行（简单快速）
- 配置 `CELERY_BROKER_URL`（与可选 `CELERY_RESULT_BACKEND`）：异步执行，适合生产

在 Azure Web App 部署（无 Redis 也能运行）
--------------------------------------
1) 创建 Linux 版 Azure Web App（Python 3.11）

2) 配置应用设置（Azure Portal → Web App → Configuration → Application settings）
- 必填：
  - `SECRET_KEY=随机字符串`
  - `ADMIN_USERNAME=你的用户名`
  - `ADMIN_PASSWORD=你的密码`（或 `ADMIN_PASSWORD_HASH=生成的哈希`）
- 不设置 `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND`，即可启用同步/eager 模式

3) 启动命令（Startup Command，Linux）

```bash
gunicorn -w 2 -k gthread -b 0.0.0.0:${PORT} app.main:app
```

4) 安装 FFmpeg（App Service 基础镜像不自带）
- 快速方式：在 Startup Command 中加入下载静态版 FFmpeg 的脚本，然后启动应用：

```bash
mkdir -p /home/site/wwwroot/bin
if ! command -v ffmpeg >/dev/null 2>&1; then
  cd /home/site/wwwroot/bin
  curl -L -o ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
  tar -xf ffmpeg.tar.xz && rm -f ffmpeg.tar.xz
  FF_DIR=$(find . -maxdepth 1 -type d -name 'ffmpeg-*' | head -n1)
  ln -sf "$FF_DIR/ffmpeg" /home/site/wwwroot/bin/ffmpeg
  ln -sf "$FF_DIR/ffprobe" /home/site/wwwroot/bin/ffprobe
fi
export PATH="/home/site/wwwroot/bin:$PATH"
exec gunicorn -w 2 -k gthread -b 0.0.0.0:${PORT} app.main:app
```

5) CI/CD（GitHub Actions）
- 在 Web App 的 Deployment Center 选择 GitHub 一键生成工作流，或参考简化版：

```yaml
name: Deploy to Azure Web App
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy web app
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ secrets.AZURE_WEBAPP_NAME }}
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

升级为异步执行（生产推荐）
------------------------
1) 部署 Redis（Azure Cache for Redis）并设置环境变量：

```bash
CELERY_BROKER_URL=redis://:<password>@<host>:<port>/0
CELERY_RESULT_BACKEND=redis://:<password>@<host>:<port>/0
```

2) 独立运行 Celery Worker（第二个 Web App/容器/ACA）：

```bash
celery -A app.celery_worker.celery worker -l info
```

其他说明
--------
- 默认目录自动创建：`input_videos/`、`output_videos/`（运行时显示为绝对路径）
- 日志文件：`logs/compress_log.jsonl`
- 生产环境建议将机密放入 App Service Application Settings 或使用 Key Vault 引用

# Video Compression Service

This project provides a simple web interface and API for compressing videos using [FFmpeg](https://ffmpeg.org/). The service is built with Flask for the HTTP layer and Celery for background processing.

## Important Files and Directories

- `app/main.py` – Flask application that exposes HTTP endpoints and serves the web UI.
- `app/tasks.py` – Celery task that runs FFmpeg to compress videos.
- `app/celery_worker.py` – Celery configuration. Uses an in-memory broker by
  default and runs tasks eagerly; set `CELERY_BROKER_URL` and
  `CELERY_RESULT_BACKEND` environment variables to use a real broker/backend.
- `app/config.py` – Default input and output directories used by the service.
- `templates/` – HTML templates for the user interface.
- `static/` – JavaScript and CSS assets used by the web UI.
- `requirements.txt` – Python dependencies.

## Setup

```bash
pip install -r requirements.txt
```

FFmpeg must be installed separately and available on the system path.

## Testing

```bash
pytest
```

## Running the Service

Run the Flask development server:

```bash
python -m app.main
```

When a real broker is configured via `CELERY_BROKER_URL`, start a Celery worker
in a separate terminal:

```bash
celery -A app.celery_worker worker --loglevel=info
```

The application will be available at `http://127.0.0.1:5001` by default.

## API

- `POST /api/compress` – submit a compression task, returns the task ID and confirmation message.

## Asynchronous Execution (Recommended)

By default, if no broker is configured, Celery uses an in-memory broker/backend and runs in eager mode for convenience during development. In that mode, `/api/compress` will execute the task synchronously in the request process.

To enable true async execution so requests return immediately and tasks run in background workers:

1) Choose and run a broker (example: Redis)

- Install Redis on your machine or server.
- Ensure the Python client is available in your environment (e.g. `pip install redis`).

2) Configure environment variables

Set these before starting Flask and the worker:

```
export CELERY_BROKER_URL=redis://127.0.0.1:6379/0
export CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
```

3) Start the Celery worker

```
celery -A app.celery_worker worker --loglevel=info
```

4) Start the Flask app normally

Now `POST /api/compress` returns a task ID immediately. Progress is reported via Celery task state and polled by the UI.

Notes:
- If you prefer RabbitMQ or another broker, set the URLs accordingly.
- When running in eager mode (no broker), background progress is not truly asynchronous.

## UI Behavior

- Submissions are non-blocking: the page remains interactive while tasks are queued.
- A small spinner appears on the "压缩选中视频" button during submission, while background polling avoids full-screen overlays.

## Authentication

The UI and APIs are protected by a simple admin login.

- Default credentials: `admin` / `admin` (for development only)
- Change via environment variables:
  - `SECRET_KEY` – Flask session secret
  - `ADMIN_USERNAME` – admin username
  - `ADMIN_PASSWORD` – plain password (dev) or
  - `ADMIN_PASSWORD_HASH` – hashed password (preferred), generated with `werkzeug.security.generate_password_hash`

Routes:
- `GET /login` – login page; `POST /login` – authenticate
- `GET /logout` – clear session

## Asynchronous Execution (Recommended)
## CI/CD to Azure App Service (GitHub Actions)

There are multiple ways to deploy. Below is a simple path using Azure Web App for Linux and GitHub Actions. It deploys the Flask app via Gunicorn. Celery workers should be run separately (another Web App/Container or Azure Container Apps) and connect to the same Redis.

Prerequisites:
- An Azure subscription and a Linux Web App created (Runtime stack: Python 3.x)
- Optional: Azure Cache for Redis (recommended for Celery)

App Service configuration (in Azure Portal → your Web App → Configuration):
- General settings: set Python version to your desired 3.x
- Application settings (Key/Value):
  - `SECRET_KEY` – a strong random string
  - `ADMIN_USERNAME`, `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
  - `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` (e.g. Redis)
  - `WEBSITES_PORT` = `8000` (when using custom startup)
- Startup command (Linux):
  - `gunicorn app.main:app --workers 2 --bind 0.0.0.0:8000`

GitHub Actions workflow:
- Add your Web App Publish Profile as a repository secret `AZURE_WEBAPP_PUBLISH_PROFILE` (Portal → Web App → Get publish profile)
- The included workflow below builds Python deps and deploys the repo content.

```yaml
name: Deploy to Azure Web App

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Upload artifact for deployment job
        uses: actions/upload-artifact@v3
        with:
          name: python-app
          path: |
            .
            !venv/**
  deploy:
    runs-on: ubuntu-latest
    needs: build-and-deploy
    steps:
      - name: Download artifact from build job
        uses: actions/download-artifact@v3
        with:
          name: python-app
          path: .
      - name: 'Deploy to Azure Web App'
        uses: azure/webapps-deploy@v2
        with:
          app-name: <YOUR_WEBAPP_NAME>
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

Celery worker options on Azure:
- Azure Container Apps / Azure Kubernetes Service – run a worker container with `celery -A app.celery_worker worker --loglevel=info`
- Separate Linux Web App running only the worker command (AlwaysOn enabled)
- Ensure both app and worker share `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND`

> Note: App Service free/basic plans may idle; enable Always On for production tiers.
- `GET /api/tasks` – list all submitted tasks and their current state.

# Video Compression Service

This project provides a simple web interface and API for compressing videos using [FFmpeg](https://ffmpeg.org/). The service is built with Flask for the HTTP layer and Celery for background processing.

## Important Files and Directories

- `app/main.py` – Flask application that exposes HTTP endpoints and serves the web UI.
- `app/tasks.py` – Celery task that runs FFmpeg to compress videos.
- `app/celery_worker.py` – Celery configuration using SQLite for both broker and backend.
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

Start a Celery worker:

```bash
celery -A app.celery_worker worker --loglevel=info
```

Run the Flask development server:

```bash
python -m app.main
```

The application will be available at `http://127.0.0.1:5001` by default.


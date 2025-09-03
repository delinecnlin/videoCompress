import subprocess
import time
import os
from app.celery_worker import celery
from app.log_utils import log_compress_task

def _probe_duration(path: str) -> float:
    """Return duration of video in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
    except Exception:
        pass
    return 0.0


@celery.task(bind=True)
def compress_video(self, input_path, output_path, codec="libx264", crf=23, extra_args=None):
    """压缩视频并报告进度和速率。"""
    duration = _probe_duration(input_path)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-c:v",
        codec,
        "-crf",
        str(crf),
        "-threads",
        "4",  # 默认4线程，可根据实际调整
        "-progress",
        "pipe:1",
        output_path,
    ]
    if extra_args:
        cmd += extra_args
    start_time = time.time()
    stdout_lines = []
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        total_size = 0
        progress = 0.0
        for line in proc.stdout:
            stdout_lines.append(line)
            line = line.strip()
            if line.startswith("out_time_ms=") and duration > 0:
                value = line.split("=", 1)[1]
                try:
                    out_ms = int(value)
                except ValueError:
                    continue  # value was "N/A" or otherwise invalid
                progress = min(100.0, out_ms / (duration * 1000) * 100)
            elif line.startswith("total_size="):
                value = line.split("=", 1)[1]
                if value.isdigit():
                    total_size = int(value)
            elapsed = time.time() - start_time
            speed = (total_size / elapsed / (1024 * 1024)) if elapsed > 0 else 0.0
            self.update_state(state="PROGRESS", meta={"progress": progress, "speed": speed})
        proc.wait()
        stdout = "".join(stdout_lines)
        returncode = proc.returncode
        elapsed = time.time() - start_time
        input_size = os.path.getsize(input_path) if os.path.exists(input_path) else 0
        output_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
        compression_ratio = (output_size / input_size) if input_size > 0 else 0.0
        speed = (output_size / elapsed / (1024 * 1024)) if returncode == 0 and elapsed > 0 else 0.0
        log_info = {
            "task_id": self.request.id,
            "filename": os.path.basename(input_path),
            "input_path": input_path,
            "output_path": output_path,
            "codec": codec,
            "crf": crf,
            "extra_args": extra_args,
            "returncode": returncode,
            "stdout": stdout,
            "stderr": "",
            "compression_ratio": compression_ratio,
            "elapsed": elapsed,
        }
        log_compress_task(log_info)
        return {
            "returncode": returncode,
            "stdout": stdout,
            "stderr": "",
            "speed": speed,
            "compression_ratio": compression_ratio,
            "elapsed": elapsed,
        }
    except Exception as e:
        elapsed = time.time() - start_time
        log_info = {
            "task_id": self.request.id,
            "filename": os.path.basename(input_path),
            "input_path": input_path,
            "output_path": output_path,
            "codec": codec,
            "crf": crf,
            "extra_args": extra_args,
            "returncode": -1,
            "error": str(e),
            "compression_ratio": 0.0,
            "elapsed": elapsed,
        }
        log_compress_task(log_info)
        return {"returncode": -1, "error": str(e), "elapsed": elapsed}

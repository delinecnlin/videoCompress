import subprocess
from app.celery_worker import celery
from app.log_utils import log_compress_task

@celery.task(bind=True)
def compress_video(self, input_path, output_path, codec="libx264", crf=23, extra_args=None):
    """
    input_path: 输入视频路径
    output_path: 输出视频路径
    codec: 压缩编码器（如libx264, libx265, libvpx-vp9, libaom-av1等）
    crf: 压缩质量参数，越小质量越高，文件越大
    extra_args: 额外FFmpeg参数（如多线程等）
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-c:v", codec,
        "-crf", str(crf),
        "-threads", "4",  # 默认4线程，可根据实际调整
        output_path
    ]
    if extra_args:
        cmd += extra_args
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        log_info = {
            "task_id": self.request.id,
            "input_path": input_path,
            "output_path": output_path,
            "codec": codec,
            "crf": crf,
            "extra_args": extra_args,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
        log_compress_task(log_info)
        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        log_info = {
            "task_id": self.request.id,
            "input_path": input_path,
            "output_path": output_path,
            "codec": codec,
            "crf": crf,
            "extra_args": extra_args,
            "returncode": -1,
            "error": str(e)
        }
        log_compress_task(log_info)
        return {
            "returncode": -1,
            "error": str(e)
        }

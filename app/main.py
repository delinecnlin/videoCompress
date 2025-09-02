from flask import Flask, request, jsonify, render_template, send_from_directory
import os
from app import config
from app.tasks import compress_video
from app.log_utils import read_logs
from app.celery_worker import celery

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "..", "templates")
STATIC_DIR = os.path.join(BASE_DIR, "..", "static")

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)

# 任务记录 {task_id: {"filename": ...}}
tasks = {}

# 获取输入输出目录
@app.route("/api/dirs", methods=["GET"])
def get_dirs():
    return jsonify({
        "input_dir": config.INPUT_DIR,
        "output_dir": config.OUTPUT_DIR
    })

# 设置输入输出目录
@app.route("/api/dirs", methods=["POST"])
def set_dirs():
    data = request.json
    input_dir = data.get("input_dir")
    output_dir = data.get("output_dir")
    if input_dir:
        config.INPUT_DIR = os.path.abspath(input_dir)
        os.makedirs(config.INPUT_DIR, exist_ok=True)
    if output_dir:
        config.OUTPUT_DIR = os.path.abspath(output_dir)
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    return jsonify({
        "input_dir": config.INPUT_DIR,
        "output_dir": config.OUTPUT_DIR
    })

# 列出输入目录下所有视频文件
@app.route("/api/input_videos", methods=["GET"])
def list_input_videos():
    files = []
    for f in os.listdir(config.INPUT_DIR):
        if f.lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm")):
            files.append(f)
    return jsonify(files)

# 添加视频压缩任务
@app.route("/api/compress", methods=["POST"])
def add_compress_task():
    data = request.json
    filename = data.get("filename")
    codec = data.get("codec", "libx264")
    crf = data.get("crf", 23)
    extra_args = data.get("extra_args")
    if not filename:
        return jsonify({"error": "No filename provided"}), 400
    input_path = os.path.join(config.INPUT_DIR, filename)
    output_path = os.path.join(config.OUTPUT_DIR, filename)
    task = compress_video.delay(input_path, output_path, codec, crf, extra_args)
    tasks[task.id] = {"filename": filename}
    return jsonify({"task_id": task.id, "message": "Task submitted"})

@app.route("/api/task_status/<task_id>", methods=["GET"])
def get_task_status(task_id):
    result = celery.AsyncResult(task_id)
    return jsonify({"task_id": task_id, "state": result.state})

@app.route("/api/logs", methods=["GET"])
def get_logs():
    logs = read_logs()
    return jsonify(logs)

# 获取所有任务及状态
@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    task_list = []
    for task_id, info in tasks.items():
        result = celery.AsyncResult(task_id)
        task_list.append({
            "task_id": task_id,
            "filename": info.get("filename"),
            "state": result.state
        })
    return jsonify(task_list)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)

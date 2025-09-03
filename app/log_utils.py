import os
import json
from datetime import datetime

LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../logs"))
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "compress_log.jsonl")
PIDS_FILE = os.path.join(LOG_DIR, "running_pids.json")

def log_compress_task(info: dict):
    info["timestamp"] = datetime.now().isoformat()
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(info, ensure_ascii=False) + "\n")

def read_logs():
    logs = []
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    logs.append(json.loads(line))
                except Exception:
                    continue
    return logs

def _read_pids_dict():
    if not os.path.exists(PIDS_FILE):
        return {}
    try:
        with open(PIDS_FILE, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}

def _write_pids_dict(data: dict):
    tmp = PIDS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PIDS_FILE)

def register_pid(task_id: str, filename: str, pid: int):
    data = _read_pids_dict()
    data[str(task_id) if task_id else "unknown"] = {
        "pid": pid,
        "filename": filename,
        "timestamp": datetime.now().isoformat(),
    }
    _write_pids_dict(data)

def unregister_pid(task_id: str):
    data = _read_pids_dict()
    key = str(task_id) if task_id else "unknown"
    if key in data:
        data.pop(key, None)
        _write_pids_dict(data)

def read_pids():
    return _read_pids_dict()

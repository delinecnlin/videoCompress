import os
from werkzeug.security import generate_password_hash

# 默认输入输出目录，可通过API修改
INPUT_DIR = os.path.abspath("input_videos")
OUTPUT_DIR = os.path.abspath("output_videos")

# 保证目录存在
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Flask session secret
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

# Admin credentials (local login)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
_admin_pw_hash = os.getenv("ADMIN_PASSWORD_HASH")
if not _admin_pw_hash:
    # Fallback for development: allow plain ADMIN_PASSWORD env or default 'admin'
    _admin_pw = os.getenv("ADMIN_PASSWORD", "admin")
    _admin_pw_hash = generate_password_hash(_admin_pw)
ADMIN_PASSWORD_HASH = _admin_pw_hash

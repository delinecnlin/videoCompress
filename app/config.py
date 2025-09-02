import os

# 默认输入输出目录，可通过API修改
INPUT_DIR = os.path.abspath("input_videos")
OUTPUT_DIR = os.path.abspath("output_videos")

# 保证目录存在
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

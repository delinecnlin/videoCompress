from celery import Celery
import os

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../db"))
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "celery.sqlite")

def make_celery(app_name=__name__):
    return Celery(
        app_name,
        broker=f"sqla+sqlite:///{DB_PATH}",
        backend=f"db+sqlite:///{DB_PATH}"
    )

celery = make_celery()

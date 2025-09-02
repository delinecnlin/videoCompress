from celery import Celery
import os


def make_celery(app_name: str = __name__) -> Celery:
    """Create a Celery instance.

    If a broker URL is not provided via the ``CELERY_BROKER_URL`` environment
    variable, an in-memory broker and backend are used and tasks are executed
    eagerly. This avoids requiring additional services during development and
    tests, while still allowing a real broker/backend to be configured
    externally.
    """

    broker = os.getenv("CELERY_BROKER_URL")
    backend = os.getenv("CELERY_RESULT_BACKEND")

    if not broker:
        celery = Celery(app_name, broker="memory://", backend="cache+memory://")
        celery.conf.task_always_eager = True
        celery.conf.task_store_eager_result = True
        return celery

    return Celery(app_name, broker=broker, backend=backend or broker)


celery = make_celery()

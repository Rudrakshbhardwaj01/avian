"""Background job manager for expensive experiments.

- ThreadPoolExecutor keeps the FastAPI event loop responsive.
- Jobs are deduplicated by configuration hash: an identical configuration
  that is already running or finished returns the same job id, preventing
  duplicate computation.
- Cancellation is cooperative: long jobs check the flag between stages.
- Finished results stay cached (bounded) so identical analyses are instant.
"""
from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

MAX_CACHED_RESULTS = 24


class JobContext:
    def __init__(self, manager: "JobManager | None" = None, job_id: str = "inline") -> None:
        self._manager = manager
        self.job_id = job_id

    def set_progress(self, progress: float, stage: str = "") -> None:
        if self._manager is not None:
            self._manager.set_progress(self.job_id, progress, stage)

    def cancelled(self) -> bool:
        return self._manager is not None and self._manager.is_cancelled(self.job_id)


class JobManager:
    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.Lock()
        # config hash -> job id (dedup)
        self._by_config: dict[str, str] = {}
        self._jobs: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def _prune(self) -> None:
        while len(self._jobs) > MAX_CACHED_RESULTS:
            oldest_id, oldest = next(iter(self._jobs.items()))
            if oldest["status"] in ("running", "pending"):
                break  # never evict running jobs
            self._jobs.pop(oldest_id)
            self._by_config.pop(oldest.get("configHash", ""), None)

    def submit(self, kind: str, config_hash: str, fn: Callable[[JobContext], Any]) -> str:
        with self._lock:
            existing = self._by_config.get(config_hash)
            if existing and self._jobs.get(existing, {}).get("status") in ("pending", "running", "complete"):
                return existing
            job_id = uuid.uuid4().hex[:12]
            self._jobs[job_id] = {
                "id": job_id, "kind": kind, "configHash": config_hash,
                "status": "pending", "progress": 0.0, "stage": "",
                "result": None, "error": None,
                "cancel": threading.Event(),
            }
            self._by_config[config_hash] = job_id
            job = self._jobs[job_id]
            self._prune()

        def run() -> None:
            ctx = JobContext(self, job_id)
            try:
                job["status"] = "running"
                result = fn(ctx)
                if job["cancel"].is_set():
                    job["status"] = "cancelled"
                else:
                    job["result"] = result
                    job["status"] = "complete"
                    job["progress"] = 1.0
            except Exception as exc:  # surface to the poller, never crash the worker
                job["error"] = f"{type(exc).__name__}: {exc}"
                job["status"] = "failed"

        self._executor.submit(run)
        return job_id

    def status(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return {
                "id": job["id"], "kind": job["kind"], "status": job["status"],
                "progress": job["progress"], "stage": job["stage"],
                "result": job["result"], "error": job["error"],
            }

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job["status"] in ("pending", "running"):
                job["cancel"].set()
                job["stage"] = "cancelling after current stage"
                return True
            return False

    def set_progress(self, job_id: str, progress: float, stage: str = "") -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job["progress"] = max(0.0, min(1.0, progress))
                if stage:
                    job["stage"] = stage

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            return bool(job and job["cancel"].is_set())


MANAGER = JobManager()

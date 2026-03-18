import os
import json
from pathlib import Path
from models import SessionLocal, Project, BuildLog, ProjectStatus
from datetime import datetime, timezone


PROJECTS_DIR = os.getenv("SWARM_PROJECTS_DIR", os.path.expanduser("~/gauntlet-swarm/projects"))


def count_files(project_path: str) -> int:
    total = 0
    skip = {".git", "node_modules", "__pycache__", ".venv", ".gradle"}
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in skip]
        total += len(files)
    return total


def get_all_log_lines(project_path: str) -> list[str]:
    log_path = Path(project_path) / ".agent_log.txt"
    if log_path.exists():
        return log_path.read_text().strip().splitlines()
    return []


def get_agent_status(project_path: str) -> dict:
    status_file = Path(project_path) / ".agent_status.json"
    if status_file.exists():
        try:
            return json.loads(status_file.read_text())
        except Exception:
            pass
    return {}


def get_build_summary(project_path: str) -> str:
    summary_file = Path(project_path) / "BUILD_SUMMARY.md"
    if summary_file.exists():
        return summary_file.read_text()
    return ""


def sync_project_status():
    db = SessionLocal()
    try:
        projects = db.query(Project).all()
        for project in projects:
            project_path = os.path.join(PROJECTS_DIR, project.id)
            if not os.path.exists(project_path):
                continue

            agent_status = get_agent_status(project_path)
            files_count = count_files(project_path)
            all_lines = get_all_log_lines(project_path)
            last_log = all_lines[-1] if all_lines else ""
            build_summary = get_build_summary(project_path)

            status_str = agent_status.get("status", "")
            if status_str == "complete":
                project.status = ProjectStatus.done
                if not project.completed_at:
                    project.completed_at = datetime.now(timezone.utc)
            elif status_str == "error":
                project.status = ProjectStatus.error
            elif files_count > 10 and project.status == ProjectStatus.queued:
                project.status = ProjectStatus.building
                if not project.started_at:
                    project.started_at = datetime.now(timezone.utc)

            project.files_count = files_count
            project.last_log = last_log or agent_status.get("last_action", "")
            # Write new log lines to BuildLog (avoid duplicates via count watermark)
            existing_count = db.query(BuildLog).filter(
                BuildLog.project_id == project.id
            ).count()
            new_lines = all_lines[existing_count:]
            for line in new_lines:
                if line.strip():
                    db.add(BuildLog(
                        project_id=project.id,
                        message=line.strip(),
                        level="info",
                        phase=project.phase or "",
                    ))
            project.phase = agent_status.get("phase", project.phase)

            if build_summary:
                project.build_summary = build_summary

            if project.started_at:
                elapsed = int((datetime.now(timezone.utc) - project.started_at.replace(tzinfo=timezone.utc)).total_seconds())
                project.elapsed_seconds = elapsed

        db.commit()
    finally:
        db.close()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models import Project, BuildLog, ProjectStatus, get_db
from seed_data import GAUNTLET_PROJECTS
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectUpdate(BaseModel):
    status: Optional[str] = None
    phase: Optional[str] = None
    live_url: Optional[str] = None
    github_url: Optional[str] = None

def project_to_dict(p):
    elapsed = p.elapsed_seconds or 0
    estimated = (p.estimated_minutes or 120) * 60
    remaining = max(0, estimated - elapsed) if p.status == ProjectStatus.building else 0
    return {
        "id": p.id, "name": p.name, "company": p.company,
        "stack": p.stack, "port": p.port,
        "status": p.status.value if p.status else "queued",
        "phase": p.phase or "", "files_count": p.files_count or 0,
        "live_url": p.live_url or "", "github_url": p.github_url or "",
        "last_log": p.last_log or "",
        "estimated_minutes": p.estimated_minutes or 120,
        "elapsed_seconds": elapsed,
        "minutes_remaining": round(remaining / 60),
        "has_build_summary": bool(p.build_summary),
        "started_at": p.started_at.isoformat() if p.started_at else None,
        "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

@router.get("/seed")
def seed_projects(db: Session = Depends(get_db)):
    count = 0
    for data in GAUNTLET_PROJECTS:
        if not db.query(Project).filter(Project.id == data["id"]).first():
            db.add(Project(**data))
            count += 1
    db.commit()
    return {"seeded": count}
    
@router.get("")
def list_projects(db: Session = Depends(get_db)):
    return [project_to_dict(p) for p in db.query(Project).order_by(Project.created_at).all()]

@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_to_dict(p)

@router.patch("/{project_id}")
def update_project(project_id: str, update: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if update.status:
        p.status = ProjectStatus[update.status]
        if update.status == "building" and not p.started_at:
            p.started_at = datetime.now(timezone.utc)
        if update.status == "done" and not p.completed_at:
            p.completed_at = datetime.now(timezone.utc)
    if update.phase is not None: p.phase = update.phase
    if update.live_url is not None: p.live_url = update.live_url
    if update.github_url is not None: p.github_url = update.github_url
    db.commit()
    return project_to_dict(p)

@router.get("/{project_id}/logs")
def get_logs(project_id: str, limit: int = 100, db: Session = Depends(get_db)):
    logs = db.query(BuildLog).filter(BuildLog.project_id == project_id)\
        .order_by(BuildLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "message": l.message, "level": l.level,
             "phase": l.phase, "created_at": l.created_at.isoformat()} for l in reversed(logs)]

import os
import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models import Project, BuildLog, ProjectStatus, get_db, QuizQuestion, QuizAttempt
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

class ProjectCreate(BaseModel):
    id: str
    name: str
    company: str
    stack: str
    brief: Optional[str] = ""
    estimated_minutes: int = 120


class RailwayWebhookPayload(BaseModel):
    type: str = ""
    status: str = ""
    url: Optional[str] = None
    service: Optional[dict] = None
    deployment: Optional[dict] = None
    project: Optional[dict] = None
    environment: Optional[dict] = None


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
        "build_summary": p.build_summary or "",
        "hiring_notes": p.hiring_notes or "",
        "brief": p.brief or "",
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

@router.post("")
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', data.id):
        raise HTTPException(status_code=400, detail="id must be lowercase letters, numbers, and hyphens only")
    if db.query(Project).filter(Project.id == data.id).first():
        raise HTTPException(status_code=409, detail=f"Project '{data.id}' already exists")
    project = Project(
        id=data.id,
        name=data.name,
        company=data.company,
        stack=data.stack,
        status=ProjectStatus.queued,
        phase="queued",
        estimated_minutes=data.estimated_minutes,
        brief=data.brief or "",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_to_dict(project)
    
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

@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    # Delete related records first
    db.query(BuildLog).filter(BuildLog.project_id == project_id).delete()
    db.query(QuizQuestion).filter(QuizQuestion.project_id == project_id).delete()
    db.query(QuizAttempt).filter(QuizAttempt.project_id == project_id).delete()
    db.delete(p)
    db.commit()
    return {"deleted": project_id}

@router.post("/{project_id}/refresh")
def refresh_project(project_id: str, db: Session = Depends(get_db)):
    """
    Re-reads source files from disk, rebuilds build summary using Claude,
    updates the project in DB. Call this after making changes to a project.
    """
    import anthropic

    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    projects_dir = os.getenv("SWARM_PROJECTS_DIR", os.path.expanduser("~/gauntlet-swarm/projects"))
    project_path = Path(projects_dir) / project_id

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project folder not found at {project_path}")

    # Collect important files (skip binary, deps, build artifacts)
    SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", ".next",
                 "dist", "build", ".gradle", "target", "vendor"}
    SKIP_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff",
                 ".ttf", ".eot", ".map", ".lock", ".sum"}
    IMPORTANT_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go",
                      ".rs", ".rb", ".cs", ".cpp", ".c", ".h", ".md", ".yaml", ".yml", ".toml"}

    collected = []
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            fpath = Path(root) / fname
            rel = str(fpath.relative_to(project_path))
            if fpath.suffix.lower() in SKIP_EXTS:
                continue
            if fpath.suffix.lower() not in IMPORTANT_EXTS:
                continue
            try:
                content = fpath.read_text(errors="replace")
                if len(content) > 200:  # skip trivial files
                    collected.append(f"=== {rel} ===\n{content[:2000]}")
                    if len("\n".join(collected)) > 15000:
                        break
            except Exception:
                continue
        if len("\n".join(collected)) > 15000:
            break

    if not collected:
        raise HTTPException(status_code=400, detail="No source files found in project folder")

    combined = "\n\n".join(collected)

    # Ask Claude to generate a fresh build summary
    ai_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    try:
        response = ai_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": f"""You are analyzing a software project to create a build summary.

PROJECT: {p.name}
COMPANY: {p.company}
STACK: {p.stack}

SOURCE FILES:
{combined}

Write a comprehensive build summary covering:
1. What was built and what problem it solves
2. Architecture decisions and why
3. Key files and what each does
4. Most important/complex parts of the code
5. Patterns and libraries used
6. What an interviewer would ask about this project

Format as markdown. Be specific — reference actual file names, function names, and 
patterns from the code. This summary will be used to generate quiz questions."""}]
        )
        new_summary = response.content[0].text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude summary failed: {str(e)}")

    # Update project
    p.build_summary = new_summary

    # Generate hiring lens — what makes this project stand out to hiring partners
    try:
        hiring_response = ai_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": f"""You are a senior engineering hiring manager reviewing a candidate's portfolio project.

PROJECT: {p.name}
COMPANY TARGET: {p.company}
STACK: {p.stack}

BUILD SUMMARY:
{new_summary[:3000]}

Analyze this project from a hiring perspective. Identify:

1. STRENGTHS — specific technical choices that signal strong engineering instincts
   (things most junior devs miss, production-thinking, non-obvious decisions)

2. TALKING POINTS — 2-3 specific things the candidate should lead with in interviews
   about this project. Be concrete — reference actual code patterns or decisions.

3. GAPS TO FILL — 1-3 small additions that would make this significantly more impressive
   to a hiring partner. Quick wins only (under a day of work each).

4. RED FLAGS — anything that might raise questions in a technical interview that
   the candidate should be prepared to defend.

Format as JSON only (no markdown):
{{
  "strengths": ["specific strength with code context", "..."],
  "talking_points": ["Lead with: ...", "Mention: ...", "If asked about scale: ..."],
  "gaps_to_fill": [
    {{"what": "Add rate limiting to the API", "why": "Shows production awareness", "effort": "2 hours"}},
    ...
  ],
  "red_flags": ["potential question and how to address it", "..."]
}}"""}]
        )
        hiring_text = hiring_response.content[0].text.strip()
        hiring_text = hiring_text.replace("```json", "").replace("```", "").strip()
        hiring_data = json.loads(hiring_text)
        p.hiring_notes = json.dumps(hiring_data)
    except Exception as e:
        print(f"Hiring lens failed (non-fatal): {e}")
        p.hiring_notes = p.hiring_notes or ""

    # Recount files
    skip = {".git", "node_modules", "__pycache__", ".venv", ".gradle"}
    total = 0
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in skip]
        total += len(files)
    p.files_count = total

    db.commit()
    return {**project_to_dict(p), "refreshed": True, "files_scanned": len(collected)}

@router.post("/{project_id}/hiring-lens")
def get_hiring_lens(project_id: str, db: Session = Depends(get_db)):
    """
    Regenerates just the hiring notes without doing a full refresh.
    Useful for projects that already have a build summary.
    """
    import anthropic

    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    if not p.build_summary:
        raise HTTPException(
            status_code=400,
            detail="No build summary yet. Run Refresh first to scan the project files."
        )

    try:
        ai_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        hiring_response = ai_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": f"""You are a senior engineering hiring manager reviewing a candidate's portfolio project.

PROJECT: {p.name}
COMPANY TARGET: {p.company}
STACK: {p.stack}

BUILD SUMMARY:
{p.build_summary[:3000]}

Analyze this project from a hiring perspective. Identify:

1. STRENGTHS — specific technical choices that signal strong engineering instincts
2. TALKING POINTS — 2-3 specific things to lead with in interviews
3. GAPS TO FILL — small additions that would make this more impressive (quick wins only)
4. RED FLAGS — things an interviewer might push back on, and how to address them

Format as JSON only (no markdown):
{{
  "strengths": ["specific strength with code context", "..."],
  "talking_points": ["Lead with: ...", "Mention: ...", "If asked about scale: ..."],
  "gaps_to_fill": [
    {{"what": "description", "why": "hiring value", "effort": "time estimate"}},
    ...
  ],
  "red_flags": ["potential question and how to address it", "..."]
}}"""}]
        )
        hiring_text = hiring_response.content[0].text.strip()
        hiring_text = hiring_text.replace("```json", "").replace("```", "").strip()
        hiring_data = json.loads(hiring_text)
        p.hiring_notes = json.dumps(hiring_data)
        db.commit()
        return {**project_to_dict(p), "hiring_data": hiring_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hiring lens failed: {str(e)}")

@router.get("/{project_id}/logs")
def get_logs(project_id: str, limit: int = 100, db: Session = Depends(get_db)):
    logs = db.query(BuildLog).filter(BuildLog.project_id == project_id)\
        .order_by(BuildLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "message": l.message, "level": l.level,
             "phase": l.phase, "created_at": l.created_at.isoformat()} for l in reversed(logs)]


@router.post("/webhook/railway")
async def railway_webhook(payload: RailwayWebhookPayload, db: Session = Depends(get_db)):
    """
    Receives Railway deployment webhooks and updates live_url when a frontend
    service deploys successfully.
    """
    # Only process successful deployments
    if payload.status not in ("SUCCESS", "COMPLETE", "success", "complete"):
        return {"received": True, "action": "ignored", "reason": f"status={payload.status}"}

    # Extract the deployed URL
    deployed_url = payload.url
    if not deployed_url:
        # Try nested deployment object
        if payload.deployment and isinstance(payload.deployment, dict):
            deployed_url = payload.deployment.get("url") or payload.deployment.get("staticUrl")
    if not deployed_url:
        return {"received": True, "action": "ignored", "reason": "no url in payload"}

    # Extract service name to match against project IDs
    service_name = ""
    if payload.service and isinstance(payload.service, dict):
        service_name = payload.service.get("name", "").lower()

    if not service_name:
        return {"received": True, "action": "ignored", "reason": "no service name"}

    # Only process frontend services (skip backend, postgres, redis)
    skip_keywords = ["backend", "postgres", "redis", "db", "database", "exquisite", "hospitable"]
    if any(kw in service_name for kw in skip_keywords):
        return {"received": True, "action": "ignored", "reason": "non-frontend service"}

    # Match service name to a project ID
    # Service names like "fsp-frontend", "replicated-frontend" → strip "-frontend" suffix
    # Then find the project whose id contains those words
    clean_name = service_name.replace("-frontend", "").replace("-fe", "").strip("-")

    projects = db.query(Project).all()
    matched = None
    best_score = 0

    for project in projects:
        # Score based on how many words from clean_name appear in project.id
        score = sum(1 for word in clean_name.split("-") if word and word in project.id)
        if score > best_score:
            best_score = score
            matched = project

    if not matched or best_score == 0:
        return {
            "received": True,
            "action": "no_match",
            "service": service_name,
            "clean_name": clean_name,
        }

    # Ensure URL has https://
    if deployed_url and not deployed_url.startswith("http"):
        deployed_url = f"https://{deployed_url}"

    # Update the project
    old_url = matched.live_url
    matched.live_url = deployed_url
    matched.status = ProjectStatus.done
    if not matched.completed_at:
        matched.completed_at = datetime.now(timezone.utc)
    db.commit()

    print(f"Railway webhook: updated {matched.id} live_url {old_url!r} → {deployed_url!r}")

    return {
        "received": True,
        "action": "updated",
        "project_id": matched.id,
        "project_name": matched.name,
        "live_url": deployed_url,
        "matched_from": service_name,
    }

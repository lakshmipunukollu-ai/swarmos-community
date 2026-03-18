import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from models import get_db, QuizQuestion, QuizAttempt
from services.quiz_engine import generate_questions, get_next_question, record_attempt, generate_code_walkthrough
from pydantic import BaseModel

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

class GenerateRequest(BaseModel):
    project_id: str
    question_type: str
    level: int = 1
    count: int = 3

class AttemptRequest(BaseModel):
    question_id: int
    project_id: str
    user_answer: str
    is_correct: bool

@router.post("/generate")
def generate(req: GenerateRequest):
    questions = generate_questions(req.project_id, req.question_type, req.level, req.count)
    return {"questions": questions}

@router.get("/next")
def next_question(project_id: str, question_type: str):
    question = get_next_question(project_id, question_type)
    return {"question": question}

@router.post("/attempt")
def submit_attempt(req: AttemptRequest):
    return record_attempt(req.question_id, req.project_id, req.user_answer, req.is_correct)

@router.get("/stats/{project_id}")
def get_stats(project_id: str, db: Session = Depends(get_db)):
    questions = db.query(QuizQuestion).filter(QuizQuestion.project_id == project_id).all()
    attempts = db.query(QuizAttempt).filter(QuizAttempt.project_id == project_id).all()
    correct = sum(1 for a in attempts if a.is_correct)
    return {
        "total_questions": len(questions),
        "total_attempts": len(attempts),
        "correct": correct,
        "accuracy": round(correct / max(len(attempts), 1) * 100),
    }


@router.get("/files/{project_id}")
def list_project_files(project_id: str):
    """Returns list of source files available for code walkthrough."""
    projects_dir = os.getenv("SWARM_PROJECTS_DIR", os.path.expanduser("~/gauntlet-swarm/projects"))
    project_path = Path(projects_dir) / project_id

    if not project_path.exists():
        return {"files": []}

    SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", ".next",
                 "dist", "build", ".gradle", "target"}
    IMPORTANT_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go",
                      ".rs", ".rb", ".cs", ".md"}

    files = []
    for root, dirs, fnames in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in fnames:
            fpath = Path(root) / fname
            if fpath.suffix.lower() in IMPORTANT_EXTS:
                rel = str(fpath.relative_to(project_path))
                size = fpath.stat().st_size
                if size > 100:
                    files.append({"path": rel, "size": size})

    files.sort(key=lambda f: f["size"], reverse=True)
    return {"files": files[:30]}


@router.post("/walkthrough")
def code_walkthrough(project_id: str, file_path: str):
    """Generates line-by-line teaching questions for a specific source file."""
    questions = generate_code_walkthrough(project_id, file_path)
    return {"questions": questions}

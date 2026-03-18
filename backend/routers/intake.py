from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import anthropic, os, json

router = APIRouter(prefix="/api/intake", tags=["intake"])
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

class IntakeRequest(BaseModel):
    brief: str
    followup_answers: Optional[str] = None

class IntakeResult(BaseModel):
    project_name: str
    company: str
    problem_statement: str
    recommended_stack: str
    key_features: List[str]
    missing_info: List[str]
    follow_up_questions: List[str]
    confidence: str
    estimated_minutes: int = 90
    ready_to_build: bool

@router.post("/analyze")
def analyze_brief(req: IntakeRequest):
    text = req.brief
    if req.followup_answers:
        text += f"\n\nFollow-up answers:\n{req.followup_answers}"
    try:
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": f"""You are a senior AI engineer analyzing a project brief to configure a build agent.

Brief:
{text}

Analyze and respond with JSON only (no markdown, no explanation):
{{
  "project_name": "short name",
  "company": "company name or Unknown",
  "problem_statement": "one sentence",
  "recommended_stack": "e.g. Python + FastAPI + React",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "missing_info": ["what is missing"],
  "follow_up_questions": ["1-3 targeted questions, empty array if complete"],
  "confidence": "high|medium|low",
  "estimated_minutes": 90,
  "ready_to_build": true or false
}}"""}]
        )
        text_resp = msg.content[0].text
        clean = text_resp.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")


class RefineRequest(BaseModel):
    original_brief: str
    analysis: dict
    answers: str

@router.post("/refine")
def refine_brief(req: RefineRequest):
    try:
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": f"""You are a senior AI engineer refining a project brief.

Original brief:
{req.original_brief}

Initial analysis:
{req.analysis}

User's answers to follow-up questions:
{req.answers}

Incorporate the answers into a refined analysis. Respond with JSON only (no markdown):
{{
  "project_name": "short name",
  "company": "company name or Unknown",
  "problem_statement": "one sentence",
  "recommended_stack": "e.g. Python + FastAPI + React",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "missing_info": [],
  "follow_up_questions": [],
  "confidence": "high",
  "ready_to_build": true,
  "estimated_minutes": 90
}}"""}]
        )
        text_resp = msg.content[0].text
        clean = text_resp.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception as e:
        raise HTTPException(500, f"Refinement failed: {str(e)}")

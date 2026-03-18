import anthropic
import os
import json
from models import SessionLocal, QuizQuestion, QuizAttempt, Project

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

QUESTION_TYPES = ["architecture", "code", "system_design", "flashcard", "code_walkthrough"]

LEVEL_DESCRIPTIONS = {
    1: "What was built — basic understanding of what this project does",
    2: "Why decisions were made — the reasoning behind architectural choices",
    3: "How the code works — understanding the implementation details",
    4: "What could go wrong — edge cases, failure modes, security concerns",
    5: "How to extend it — adding features, scaling, redesigning",
}

TYPE_PROMPTS = {
    "architecture": "Focus on technology choices, database design, API structure, and why specific patterns were chosen over alternatives.",
    "code": "Show a realistic code snippet from this type of project and ask what it does, what would break if removed, or what edge case it handles.",
    "system_design": "Ask how the system would handle scale, new features, failures, or different requirements.",
    "flashcard": "Create a concise concept definition or key fact from this project's domain.",
}


def generate_questions(project_id: str, question_type: str, level: int, count: int = 3) -> list:
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return []

        build_summary = project.build_summary or ""
        summary_section = f"\n\nBUILD SUMMARY (actual code written):\n{build_summary[:3000]}" if build_summary else ""

        prompt = f"""You are a technical interviewer helping an engineer deeply understand a project they built.
The engineer needs to be able to defend every decision in interviews.

PROJECT: {project.name}
COMPANY: {project.company}
STACK: {project.stack}
PORT: {project.port}{summary_section}

LEVEL {level}: {LEVEL_DESCRIPTIONS[level]}
QUESTION TYPE: {TYPE_PROMPTS[question_type]}

Generate {count} questions at level {level}.
Questions should be specific to THIS project, not generic.
If level > 1, reference specific decisions made in this project.

For architecture/code/system_design questions respond with JSON array:
[{{
  "question": "...",
  "correct_answer": "...",
  "wrong_answers": ["...", "...", "..."],
  "explanation": "Deep explanation of why this is correct and what the interviewer is really testing",
  "level": {level},
  "type": "{question_type}"
}}]

For flashcard questions respond with JSON array:
[{{
  "question": "What is X?",
  "correct_answer": "X is... (under 50 words)",
  "wrong_answers": [],
  "explanation": "Why this concept matters in the context of {project.name}",
  "level": {level},
  "type": "flashcard"
}}]

Respond ONLY with the JSON array. No markdown. No preamble."""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        text = response.content[0].text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        questions = json.loads(text)

        saved = []
        for q in questions:
            question = QuizQuestion(
                project_id=project_id,
                question_type=q["type"],
                level=q["level"],
                question=q["question"],
                correct_answer=q["correct_answer"],
                wrong_answers=json.dumps(q.get("wrong_answers", [])),
                explanation=q["explanation"],
            )
            db.add(question)
            db.flush()
            saved.append({
                "id": question.id,
                "question": question.question,
                "correct_answer": question.correct_answer,
                "wrong_answers": json.loads(question.wrong_answers or "[]"),
                "explanation": question.explanation,
                "level": question.level,
                "type": question.question_type,
            })
        db.commit()
        return saved
    except Exception as e:
        print(f"Quiz generation error: {e}")
        return []
    finally:
        db.close()


def get_next_question(project_id: str, question_type: str) -> dict:
    db = SessionLocal()
    try:
        # Prioritize questions the user got wrong
        weak = db.query(QuizQuestion).filter(
            QuizQuestion.project_id == project_id,
            QuizQuestion.question_type == question_type,
            QuizQuestion.times_shown > 0,
        ).order_by(
            (QuizQuestion.times_correct / (QuizQuestion.times_shown + 1)).asc()
        ).first()

        if weak and (weak.times_correct / max(weak.times_shown, 1)) < 0.7:
            return {
                "id": weak.id,
                "question": weak.question,
                "correct_answer": weak.correct_answer,
                "wrong_answers": json.loads(weak.wrong_answers or "[]"),
                "explanation": weak.explanation,
                "level": weak.level,
                "type": weak.question_type,
                "is_review": True,
            }

        # Otherwise return a question not yet shown
        unseen = db.query(QuizQuestion).filter(
            QuizQuestion.project_id == project_id,
            QuizQuestion.question_type == question_type,
            QuizQuestion.times_shown == 0,
        ).first()

        if unseen:
            return {
                "id": unseen.id,
                "question": unseen.question,
                "correct_answer": unseen.correct_answer,
                "wrong_answers": json.loads(unseen.wrong_answers or "[]"),
                "explanation": unseen.explanation,
                "level": unseen.level,
                "type": unseen.question_type,
                "is_review": False,
            }

        return {}
    finally:
        db.close()


def record_attempt(question_id: int, project_id: str, user_answer: str, is_correct: bool) -> dict:
    db = SessionLocal()
    try:
        question = db.query(QuizQuestion).filter(QuizQuestion.id == question_id).first()
        if not question:
            return {}

        question.times_shown += 1
        if is_correct:
            question.times_correct += 1

        attempt = QuizAttempt(
            question_id=question_id,
            project_id=project_id,
            user_answer=user_answer,
            is_correct=1 if is_correct else 0,
            needs_review=0 if is_correct else 1,
        )
        db.add(attempt)

        # If wrong, generate a better explanation
        better_explanation = ""
        if not is_correct:
            better_explanation = explain_better(question.question, question.correct_answer, user_answer, question.explanation)
            question.explanation = better_explanation

        db.commit()

        return {
            "is_correct": is_correct,
            "correct_answer": question.correct_answer,
            "explanation": better_explanation or question.explanation,
            "times_shown": question.times_shown,
            "times_correct": question.times_correct,
        }
    finally:
        db.close()


def explain_better(question: str, correct_answer: str, user_answer: str, original_explanation: str) -> str:
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": f"""The user got this question wrong and needs a better explanation.

Question: {question}
Correct answer: {correct_answer}
User answered: {user_answer}
Original explanation: {original_explanation}

Write a clearer, simpler explanation. Use an analogy if helpful.
Explain WHY their answer was wrong and WHY the correct answer is right.
Keep it under 150 words. Be encouraging but direct."""}]
        )
        return response.content[0].text.strip()
    except Exception:
        return original_explanation


def generate_code_walkthrough(project_id: str, file_path: str) -> list:
    """
    Reads a source file and generates line-by-line teaching questions.
    file_path is relative to SWARM_PROJECTS_DIR/{project_id}/
    """
    import os
    from pathlib import Path

    projects_dir = os.getenv("SWARM_PROJECTS_DIR", os.path.expanduser("~/gauntlet-swarm/projects"))
    full_path = Path(projects_dir) / project_id / file_path

    if not full_path.exists():
        return [{"error": f"File not found: {file_path}"}]

    source_code = full_path.read_text(errors="replace")
    if len(source_code) > 8000:
        source_code = source_code[:8000] + "\n\n[... file truncated for context ...]"

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        project_name = project.name if project else project_id
        stack = project.stack if project else ""
    finally:
        db.close()

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=3000,
            messages=[{"role": "user", "content": f"""You are teaching an engineer to deeply understand code they built.

PROJECT: {project_name}
STACK: {stack}
FILE: {file_path}

SOURCE CODE:
{source_code}

Generate 5-8 teaching questions about this specific file.
Cover: what each important section does, why it was written this way,
what would break if removed, any patterns or gotchas.

Respond with JSON array only (no markdown):
[{{
  "question": "What does lines X-Y do and why is it important?",
  "correct_answer": "Detailed explanation of what the code does and why",
  "wrong_answers": ["Plausible but incorrect explanation 1", "Plausible but incorrect explanation 2", "Plausible but incorrect explanation 3"],
  "explanation": "Deeper context — the pattern being used, why this approach vs alternatives",
  "level": 3,
  "type": "code_walkthrough",
  "line_reference": "lines X-Y or function name"
}}]"""}]
        )
        text = response.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception as e:
        return [{"error": str(e)}]

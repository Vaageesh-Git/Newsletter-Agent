# main.py
import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

# Import agent logic and state stores
from agent import run_newsletter_agent, progress_store, pending_newsletters

app = FastAPI(title="Newsletter Agent API")

# Enable CORS for localhost:3000 (React standard) and localhost:5173 (Vite standard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve output directory path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../output"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------------------------------
# SCHEMAS
# ----------------------------------------------------
class GenerateRequest(BaseModel):
    goal: str
    mode: str = "auto"  # "auto" or "hitl"
    taskId: Optional[str] = None

class ApproveRequest(BaseModel):
    session_id: str
    taskId: Optional[str] = None

# ----------------------------------------------------
# ROUTES
# ----------------------------------------------------
@app.get("/health")
@app.head("/health")
async def health_check():
    """
    Simple health check endpoint for monitoring tools.
    """
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/generate")
async def generate_newsletter(req: GenerateRequest):
    """
    Starts the newsletter agent pipeline.
    Runs the blocking agent inside FastAPI's thread pool so polling status requests are not blocked.
    """
    if not req.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty.")
    if req.mode not in ["auto", "hitl"]:
        raise HTTPException(status_code=400, detail="Mode must be 'auto' or 'hitl'.")
        
    try:
        # Run agent in thread pool
        result = await run_in_threadpool(
            run_newsletter_agent,
            goal=req.goal,
            mode=req.mode,
            session_id=None,
            task_id=req.taskId
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")

@app.post("/approve")
async def approve_newsletter(req: ApproveRequest):
    """
    Approves and finishes a paused newsletter (saves to output/ folder).
    """
    if not req.session_id:
        raise HTTPException(status_code=400, detail="Session ID is required.")
        
    try:
        result = await run_in_threadpool(
            run_newsletter_agent,
            goal="",
            mode="auto",
            session_id=req.session_id,
            task_id=req.taskId
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Approval failed: {str(e)}")

@app.get("/status/{taskId}")
async def get_task_status(taskId: str):
    """
    Returns the current status / progress of the newsletter pipeline execution.
    """
    if taskId not in progress_store:
        # Return default pending steps if task hasn't registered yet
        return {
            "steps_log": [
                {"name": "Plan", "status": "pending"},
                {"name": "Research", "status": "pending"},
                {"name": "Summarize", "status": "pending"},
                {"name": "Write", "status": "pending"},
                {"name": "Critique", "status": "pending"},
                {"name": "Output", "status": "pending"}
            ],
            "current_detail": "Starting pipeline..."
        }
    return progress_store[taskId]

@app.get("/newsletters")
async def get_saved_newsletters():
    """
    Lists all saved newsletters in the output/ directory.
    Sorted by modification time (newest first).
    """
    if not os.path.exists(OUTPUT_DIR):
        return []
        
    try:
        files = []
        for filename in os.listdir(OUTPUT_DIR):
            if filename.endswith(".html"):
                filepath = os.path.join(OUTPUT_DIR, filename)
                stat = os.stat(filepath)
                # Parse title or subject from filename or file size
                files.append({
                    "filename": filename,
                    "created_at": stat.st_mtime,
                    "size_bytes": stat.st_size
                })
        # Sort by creation/mtime descending
        files.sort(key=lambda x: x["created_at"], reverse=True)
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list newsletters: {str(e)}")

@app.get("/newsletter/{filename}", response_class=HTMLResponse)
async def get_newsletter_content(filename: str):
    """
    Returns the raw HTML content of a saved newsletter.
    """
    # Prevent directory traversal attacks
    clean_filename = os.path.basename(filename)
    filepath = os.path.join(OUTPUT_DIR, clean_filename)
    
    if not os.path.exists(filepath) or not clean_filename.endswith(".html"):
        raise HTTPException(status_code=404, detail="Newsletter not found.")
        
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read newsletter: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

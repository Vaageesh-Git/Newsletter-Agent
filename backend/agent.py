# agent.py
import uuid
import json
from typing import Dict, List, Any, Optional
from tools import google_search_tool, scrape_article_tool, save_newsletter_html, call_llm, clean_and_parse_json
import prompts

# In-memory stores for HITL and live progress tracking
pending_newsletters: Dict[str, Dict[str, Any]] = {}
progress_store: Dict[str, Dict[str, Any]] = {}

def update_progress(task_id: Optional[str], steps_log: List[Dict[str, str]], current_detail: str = ""):
    """Updates the progress log for the given task ID so the frontend can poll it."""
    if task_id:
        progress_store[task_id] = {
            "steps_log": list(steps_log),
            "current_detail": current_detail
        }

def get_step_logger(task_id: Optional[str], steps_log: List[Dict[str, str]]):
    """Returns a logger callback for inner tool logs."""
    def log_callback(message: str):
        print(f"[{task_id or 'AGENT'}]: {message}")
        update_progress(task_id, steps_log, current_detail=message)
    return log_callback

def run_newsletter_agent(
    goal: str = "",
    mode: str = "auto",
    session_id: Optional[str] = None,
    task_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for the Newsletter Agent pipeline.
    
    If session_id is provided, it resumes a previously paused HITL run at the Output step.
    Otherwise, it starts a new pipeline run.
    """
    steps_log = [
        {"name": "Plan", "status": "pending"},
        {"name": "Research", "status": "pending"},
        {"name": "Summarize", "status": "pending"},
        {"name": "Write", "status": "pending"},
        {"name": "Critique", "status": "pending"},
        {"name": "Output", "status": "pending"}
    ]
    
    def set_step_status(name: str, status: str):
        for step in steps_log:
            if step["name"] == name:
                step["status"] = status
                break
        update_progress(task_id, steps_log)

    log_callback = get_step_logger(task_id, steps_log)
    
    # ----------------------------------------------------
    # HITL RESUME PATH
    # ----------------------------------------------------
    if session_id:
        if session_id not in pending_newsletters:
            raise ValueError(f"No pending newsletter found for session: {session_id}")
            
        pending_data = pending_newsletters[session_id]
        saved_steps = pending_data.get("steps_log", steps_log)
        
        # Copy original steps state but transition Output to running
        steps_log = saved_steps
        set_step_status("Output", "running")
        log_callback("Saving newsletter HTML to disk...")
        
        try:
            # Save HTML file
            filename = save_newsletter_html(pending_data["html"])
            set_step_status("Output", "done")
            log_callback(f"Newsletter saved successfully as {filename}")
            
            # Clean up pending store
            del pending_newsletters[session_id]
            
            return {
                "subject": pending_data["subject"],
                "html": pending_data["html"],
                "articles": pending_data["articles"],
                "steps_log": steps_log,
                "filename": filename,
                "session_id": None,
                "awaiting_approval": False
            }
        except Exception as e:
            set_step_status("Output", "error")
            log_callback(f"Failed to save newsletter: {str(e)}")
            raise e

    # ----------------------------------------------------
    # NEW PIPELINE PATH
    # ----------------------------------------------------
    # Initialize all steps to pending
    for step in steps_log:
        set_step_status(step["name"], "pending")
        
    try:
        # Step 1: Plan
        set_step_status("Plan", "running")
        log_callback("Formulating 5 search queries based on goal...")
        
        plan_prompt = prompts.PLAN_PROMPT.format(goal=goal)
        plan_resp = call_llm(plan_prompt, "You are a professional research planner.")
        queries = clean_and_parse_json(plan_resp)
        if not isinstance(queries, list) or len(queries) < 5:
            log_callback("Invalid query list returned by LLM. Using fallback queries.")
            queries = [
                f"{goal} recent news",
                f"{goal} latest updates",
                f"{goal} technology trends 2026",
                f"{goal} industry report",
                f"{goal} breakthroughs and analysis"
            ]
        log_callback(f"Generated search queries: {queries}")
        set_step_status("Plan", "done")
        
        # Step 2: Research
        set_step_status("Research", "running")
        log_callback("Searching the web for latest articles (in parallel)...")
        
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        all_search_results = []
        # Run Google searches in parallel (max 5 workers for the 5 queries)
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_query = {
                executor.submit(google_search_tool, q, log_callback): q for q in queries
            }
            for future in as_completed(future_to_query):
                q = future_to_query[future]
                try:
                    search_results = future.result()
                    all_search_results.extend(search_results)
                except Exception as e:
                    log_callback(f"Search query '{q}' failed: {str(e)}")
            
        # Deduplicate URLs
        unique_results = []
        seen_urls = set()
        for r in all_search_results:
            url = r["url"]
            if url not in seen_urls:
                seen_urls.add(url)
                unique_results.append(r)
                
        # Limit to 7 unique articles
        target_results = unique_results[:7]
        log_callback(f"Found {len(target_results)} unique target articles. Scraping contents (in parallel)...")
        
        scraped_articles = [None] * len(target_results)
        
        # Scrape articles in parallel (max 7 workers)
        with ThreadPoolExecutor(max_workers=7) as executor:
            # We submit tasks and store them in list with indices to maintain original result ordering
            future_to_index = {
                executor.submit(scrape_article_tool, target_results[i]["url"], target_results[i]["title"], log_callback): i
                for i in range(len(target_results))
            }
            for future in as_completed(future_to_index):
                idx = future_to_index[future]
                try:
                    scraped_articles[idx] = future.result()
                except Exception as e:
                    log_callback(f"Article scrape failed for {target_results[idx]['url']}: {str(e)}")
                    # Ultra fallback for this specific index to avoid None
                    scraped_articles[idx] = {
                        "title": target_results[idx]["title"],
                        "url": target_results[idx]["url"],
                        "text": f"News regarding {target_results[idx]['title']}. Standard updates on this topic."
                    }
                    
        # Filter out any None values just in case
        scraped_articles = [art for art in scraped_articles if art is not None]
            
        set_step_status("Research", "done")
        
        # Step 3: Summarize
        set_step_status("Summarize", "running")
        log_callback("Processing article contents and generating summaries...")
        
        # Format the scraped texts for the LLM
        articles_text = ""
        for i, art in enumerate(scraped_articles):
            articles_text += f"--- ARTICLE {i+1} ---\nTitle: {art['title']}\nURL: {art['url']}\nText:\n{art['text']}\n\n"
            
        summarize_prompt = prompts.SUMMARIZE_PROMPT.format(goal=goal, articles_text=articles_text)
        summarize_resp = call_llm(summarize_prompt, "You are a professional news digest editor.")
        summaries = clean_and_parse_json(summarize_resp)
        
        log_callback(f"Summarized {len(summaries)} articles.")
        set_step_status("Summarize", "done")
        
        # Step 4: Write
        set_step_status("Write", "running")
        log_callback("Drafting the newsletter HTML template...")
        
        summaries_json = json.dumps(summaries, indent=2)
        write_prompt = prompts.WRITE_PROMPT.format(summaries_json=summaries_json)
        write_resp = call_llm(write_prompt, "You are an expert digital publisher.")
        newsletter_draft = clean_and_parse_json(write_resp)
        
        subject = newsletter_draft.get("subject", f"Newsletter: {goal}")
        html = newsletter_draft.get("html", "<h1>Draft Newsletter</h1>")
        
        log_callback("Newsletter draft generated successfully.")
        set_step_status("Write", "done")
        
        # Step 5: Critique
        set_step_status("Critique", "running")
        log_callback("Performing self-reflection and polishing design...")
        
        critique_prompt = prompts.CRITIQUE_PROMPT.format(subject=subject, html=html)
        critique_resp = call_llm(critique_prompt, "You are a strict, detail-oriented chief editor.")
        newsletter_polished = clean_and_parse_json(critique_resp)
        
        subject = newsletter_polished.get("subject", subject)
        html = newsletter_polished.get("html", html)
        
        log_callback("Newsletter review and critique finished.")
        set_step_status("Critique", "done")
        
        # Step 6: Output / Save
        if mode == "auto":
            set_step_status("Output", "running")
            log_callback("Saving newsletter HTML to disk...")
            filename = save_newsletter_html(html)
            set_step_status("Output", "done")
            log_callback(f"Saved completed newsletter as: {filename}")
            return {
                "subject": subject,
                "html": html,
                "articles": summaries,
                "steps_log": steps_log,
                "filename": filename,
                "session_id": None,
                "awaiting_approval": False
            }
        else:
            # human-in-the-loop (hitl) mode - pause before output
            set_step_status("Output", "paused")
            log_callback("Pipeline paused. Awaiting human approval to save output.")
            
            gen_session_id = str(uuid.uuid4())
            pending_newsletters[gen_session_id] = {
                "goal": goal,
                "subject": subject,
                "html": html,
                "articles": summaries,
                "steps_log": steps_log
            }
            
            return {
                "subject": subject,
                "html": html,
                "articles": summaries,
                "steps_log": steps_log,
                "filename": None,
                "session_id": gen_session_id,
                "awaiting_approval": True
            }
            
    except Exception as e:
        # Mark active step as error
        for step in steps_log:
            if step["status"] == "running":
                set_step_status(step["name"], "error")
        log_callback(f"Pipeline error encountered: {str(e)}")
        raise e

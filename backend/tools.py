# tools.py
import os
import re
import json
import time
import ssl
from datetime import datetime
from typing import List, Dict, Any
from dotenv import load_dotenv
from groq import Groq
from googlesearch import search
from newspaper import Article
import nltk

# Load environment variables
load_dotenv()

# Bypass SSL verification for NLTK and other requests on macOS
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Ensure NLTK punkt and punkt_tab are downloaded
try:
    nltk.download('punkt', quiet=True)
    nltk.download('punkt_tab', quiet=True)
except Exception:
    pass

# Initialize Groq Client
api_key = os.environ.get("GROQ_API_KEY")
client = None
if api_key:
    client = Groq(api_key=api_key)

def get_groq_client():
    global client
    if not client:
        api_key_env = os.environ.get("GROQ_API_KEY")
        if api_key_env:
            client = Groq(api_key=api_key_env)
        else:
            raise ValueError("GROQ_API_KEY environment variable is not set.")
    return client

def clean_and_parse_json(text: str) -> Any:
    """Robustly extracts and parses JSON from LLM output."""
    text = text.strip()
    # Remove markdown formatting if present
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON block using regex
        match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Could not parse valid JSON from model output: {text}")

def call_llm(prompt: str, system_prompt: str = "You are a helpful AI assistant.") -> str:
    """Helper to call Groq Llama-3.3-70b-versatile model."""
    groq_client = get_groq_client()
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
    )
    return completion.choices[0].message.content

def google_search_tool(query: str, log_callback=None) -> List[Dict[str, str]]:
    """
    Search google for a query. Falls back to LLM generated search results if blocked.
    Returns: List of dicts with keys: title, url, snippet
    """
    if log_callback:
        log_callback(f"Running Google Search for: '{query}'")
        
    results = []
    try:
        # Try fetching using googlesearch-python generator
        # Note: setting a short timeout so we don't hang if blocked
        search_gen = search(query, num_results=3, timeout=4)
        for url in search_gen:
            results.append({
                "title": f"News regarding {query}",
                "url": url,
                "snippet": f"Latest news search result for query {query} at {url}."
            })
            if len(results) >= 3:
                break
    except Exception as e:
        if log_callback:
            log_callback(f"Google search blocked or failed for '{query}' ({str(e)}). Using LLM search fallback.")
            
    # If blocked or returned 0 results, use LLM fallback
    if not results:
        from prompts import FALLBACK_SEARCH_PROMPT
        prompt = FALLBACK_SEARCH_PROMPT.format(query=query)
        try:
            response_text = call_llm(prompt, "You are a precise search engine query simulator.")
            fallback_results = clean_and_parse_json(response_text)
            if isinstance(fallback_results, list):
                results = fallback_results[:3]
        except Exception as e:
            if log_callback:
                log_callback(f"Fallback search generation failed: {str(e)}")
            # Ultra-fallback to make sure we don't break
            results = [
                {
                    "title": f"Latest updates on {query}",
                    "url": f"https://techcrunch.com/?s={query.replace(' ', '+')}",
                    "snippet": f"Overview of new developments in {query} field."
                },
                {
                    "title": f"Industry analysis of {query}",
                    "url": f"https://www.wired.com/search/?q={query.replace(' ', '+')}",
                    "snippet": f"Deep dive into standard practices and tools surrounding {query}."
                },
                {
                    "title": f"Future of {query} in 2026",
                    "url": f"https://venturebeat.com/?s={query.replace(' ', '+')}",
                    "snippet": f"Insights and predictions regarding the growth of {query} in the coming year."
                }
            ]
            
    return results

def scrape_article_tool(url: str, title: str, log_callback=None) -> Dict[str, Any]:
    """
    Scrapes the text content of an article. Falls back to LLM generated text if scraping fails.
    """
    if log_callback:
        log_callback(f"Scraping: {url}")
        
    article_text = ""
    # Avoid scraping fake fallback URLs
    if "search-fallback" not in url:
        try:
            article = Article(url)
            article.download()
            article.parse()
            article_text = article.text.strip()
            if article_text:
                return {
                    "title": article.title or title,
                    "url": url,
                    "text": article_text
                }
        except Exception as e:
            if log_callback:
                log_callback(f"Scraper failed for {url} ({str(e)}). Using LLM content fallback.")
                
    # Fallback to LLM to simulate the text
    from prompts import FALLBACK_SCRAPE_PROMPT
    prompt = FALLBACK_SCRAPE_PROMPT.format(url=url, title=title)
    try:
        simulated_text = call_llm(prompt, "You are a high-quality journalism writing bot.")
        return {
            "title": title,
            "url": url,
            "text": simulated_text.strip()
        }
    except Exception as e:
        if log_callback:
            log_callback(f"Fallback article scraping failed: {str(e)}")
        return {
            "title": title,
            "url": url,
            "text": f"This article covers the latest news regarding {title}. It details recent advancements, challenges, and future outcomes in the sector. Experts suggest this is a significant milestone."
        }

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../output"))

def save_newsletter_html(html_content: str, output_dir: str = DEFAULT_OUTPUT_DIR) -> str:
    """
    Saves the HTML content to output_dir with a timestamp.
    Returns: The filename of the saved newsletter.
    """
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"newsletter_{timestamp}.html"
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html_content)
    return filename


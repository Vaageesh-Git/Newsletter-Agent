# prompts.py

PLAN_PROMPT = """
You are an expert news researcher. Given the user's goal for a newsletter, generate exactly 5 focused, high-quality search queries to find the latest and most relevant news articles on the web.
The goal is: "{goal}"

Your output must be a valid JSON array of 5 strings, representing the search queries. Do not include any markdown formatting, explanation, or extra characters. Example:
[
  "query 1",
  "query 2",
  "query 3",
  "query 4",
  "query 5"
]
"""

SUMMARIZE_PROMPT = """
You are an AI assistant summarizing news articles for a premium newsletter. Below is a collection of articles scraped from the web based on the goal: "{goal}"

Scraped Articles:
{articles_text}

Analyze these articles. Extract the top 5 to 7 most relevant and high-quality articles. For each article, write a concise summary (2-3 sentences) and extract 3-4 key bullet points.
Your output must be a valid JSON array of objects, with each object having exactly these keys: "title", "url", "summary", "key_points" (which is an array of strings).

Do not include any extra text, comments, markdown, or explanations. The response must be purely parseable JSON. Example:
[
  {{
    "title": "Article Title",
    "url": "https://example.com/article",
    "summary": "This is a brief summary of the article.",
    "key_points": [
      "Key point number one.",
      "Key point number two.",
      "Key point number three."
    ]
  }}
]
"""

WRITE_PROMPT = """
You are a professional editor and copywriter. Write a clean, engaging, and beautifully styled HTML newsletter based on the following article summaries:

Article Summaries:
{summaries_json}

The newsletter must include:
1. An engaging subject line.
2. A header with a title for the newsletter.
3. An introductory paragraph setting the stage and summarizing the theme of this edition.
4. One section per article. Each section must display:
   - The article title (clickable link to the source URL)
   - A short, readable summary
   - A list of key bullet points
5. A professional footer.

Design Instructions:
- Inject modern, inline CSS styles. Use a clean, minimal, professional layout.
- Use a beautiful color palette (e.g. sleek dark slate headers, pleasant readable text font like system-ui or Inter, subtle borders, and ample padding).
- Do not use Tailwind in the email (email clients do not support Tailwind class sheets). Use robust inline styling compatible with email clients (e.g., max-width: 600px; margin: 0 auto; font-family: sans-serif; line-height: 1.6; etc.).
- Ensure all links are stylized and open in a new tab (`target="_blank"`).

Your output must be a JSON object with exactly two keys:
- "subject": The email subject line.
- "html": The complete HTML code for the newsletter.

Do not include any markdown, code blocks (like ```json), or extra text outside the JSON. Return only the JSON object.
"""

CRITIQUE_PROMPT = """
You are a senior editor self-reviewing a newly written HTML newsletter. Your task is to critique the newsletter and return an improved version.

Review it for:
1. Relevance to the theme.
2. Tone (professional, engaging, informative).
3. Formatting (valid HTML, clean inline styles, readable typography, responsive layout).
4. Completeness (all selected articles are included, links work and open in new tabs, subject line is catchy).

Original Newsletter Details:
Subject: {subject}
HTML Content:
{html}

Critique the newsletter, make necessary adjustments, and return the improved version.
Your output must be a JSON object with exactly two keys:
- "subject": The refined subject line.
- "html": The improved, complete HTML code for the newsletter.

Do not include any comments, explanations, markdown formatting, or code blocks. Return only the JSON object.
"""

FALLBACK_SEARCH_PROMPT = """
You are an AI-powered search engine crawler. We are unable to connect to the Google search engine API due to rate limits.
Given the search query: "{query}"
Generate 3 realistic, high-quality, and highly relevant news article results that would likely be published or updated recently.
For each result, provide:
1. A realistic title.
2. A functional, valid source URL (e.g., from tech news sites like techcrunch.com, wired.com, venturebeat.com, medium.com, bloomberg.com, etc.).
   IMPORTANT: To ensure the URL does not return a 404 when clicked, use the top-level homepages of these sites (e.g., 'https://techcrunch.com', 'https://www.wired.com', 'https://venturebeat.com') or a working search page URL on those sites (e.g., 'https://techcrunch.com/?s=ai', 'https://www.wired.com/search/?q=agents'). Do not generate paths to specific articles (like /2026/06/02/ai-agents) as those paths are simulated and do not exist on the live websites.
3. A realistic search snippet (1-2 sentences).

Your output must be a valid JSON array of 3 objects, each having the keys: "title", "url", "snippet".
Do not include any markdown, code blocks, or extra text. Return only the JSON.
"""


FALLBACK_SCRAPE_PROMPT = """
You are a web scraper backup. We are unable to fetch the content from the URL: "{url}" (Title: "{title}").
Based on the title, URL, and the theme of the newsletter, write a realistic, high-quality, and informative news article body (approx 250-400 words) as if it were scraped from that URL.
Do not include any HTML formatting, markdown, or intros like "Here is the article:". Just write the raw text of the article itself.
"""

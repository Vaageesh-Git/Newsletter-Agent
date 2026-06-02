import ssl
import sys

# Bypass SSL verification for nltk download and other urllib requests
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

import nltk
print("Downloading NLTK punkt tokenizer...")
try:
    nltk.download('punkt', quiet=True)
    nltk.download('punkt_tab', quiet=True)
    print("NLTK download complete.")
except Exception as e:
    print(f"Error downloading NLTK data: {e}")

from googlesearch import search
from newspaper import Article

print("Testing Google Search...")
try:
    # Try searching with a timeout and advanced=False
    results = []
    # search returns a generator. Let's iterate and print with a break
    for idx, r in enumerate(search("artificial intelligence agents news 2026", num_results=3, timeout=5)):
        print(f"Result {idx}: {r}")
        results.append(r)
        if len(results) >= 3:
            break
    print("Search results fetched successfully.")
except Exception as e:
    print(f"Error searching: {e}")

print("Testing Newspaper Scraper...")
try:
    url = "https://en.wikipedia.org/wiki/Artificial_intelligence"
    article = Article(url)
    article.download()
    article.parse()
    print("Scrape successful. Title:")
    print(article.title)
    print("Text length:", len(article.text))
except Exception as e:
    print(f"Error scraping: {e}")

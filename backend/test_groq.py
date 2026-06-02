import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

from groq import Groq

api_key = os.environ.get("GROQ_API_KEY")
print("Using key:", api_key[:10] + "..." if api_key else "None")

try:
    client = Groq(api_key=api_key)
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Hello, explain AI agents in one short sentence.",
            }
        ],
        model="llama-3.3-70b-versatile",
    )
    print("Response:")
    print(chat_completion.choices[0].message.content)
except Exception as e:
    print(f"Error calling Groq: {e}")

import requests
import json

# --- CONFIGURATION ---
# Replace with your Long-lived Channel Access Token
CHANNEL_ACCESS_TOKEN = ""

# Replace with "Your User ID" from the Basic Settings tab
USER_ID = "" 
# ---------------------

def send_test_message():
    url = "https://api.line.me/v2/bot/message/push"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
    }
    
    payload = {
        "to": USER_ID,
        "messages": [
            {
                "type": "text",
                "text": "これはテストメッセージです。Messaging APIの動作確認を行っています。"
            },
            {
                "type": "text",
                "text": "If you see this, your Messaging API is working perfectly! 🚀"
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status() # Check for HTTP errors
        print(f"✅ Success! Message sent to {USER_ID}")
        print(f"Response Code: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to send message: {e}")
        if response is not None:
             print(f"API Response: {response.text}")

if __name__ == "__main__":
    send_test_message()

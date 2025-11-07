# 🚀 NoteX - AI-Powered Document Summarizer & Chat

> A modern web application that summarizes YouTube videos, PDFs, and provides intelligent chat capabilities using Google Gemini AI.

![NoteX Banner](./assets/screenshot.png)

## ✨ Features

- 💬 **AI Chat** - Intelligent conversation with Google Gemini 2.0 Flash
- 🎥 **YouTube Summarization** - Extract and summarize video transcripts
- 📄 **Document Upload** - Summarize PDF and DOCX files
- 💾 **Chat Persistence** - Save and manage chat history in Firebase
- 🌙 **Dark Mode** - Toggle between light and dark themes
- 🔐 **User Authentication** - Secure login with Firebase Auth
- 📱 **Responsive Design** - Works on desktop and mobile

## 📸 Screenshots

### Chat Interface
![Chat Interface](./assets/chat-screenshot.png)

### YouTube Summarization
![YouTube Summary](./assets/youtube-screenshot.png)

### Dark Mode
![Dark Mode](./assets/dark-mode-screenshot.png)

## 🛠️ Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Firebase Authentication
- Responsive UI Design

### Backend
- FastAPI (Python)
- Google Generative AI (Gemini 2.0)
- Firebase Realtime Database
- YouTube Transcript API
- PyPDF2 & python-docx

## 📦 Installation

### Prerequisites
- Python 3.8+
- Firebase Account
- Google AI API Key

### 1. Clone Repository
git clone https://github.com/rajveersinghal/NoteX.git

### 2. Backend Setup
cd backend
python -m

Activate virtual environment
Windows:
myenv\Scripts\activate

Linux/Mac:
source myenv/bin/activate

Install dependencies
pip install -r requirements.txt

### 3. Environment Variables
Create `.env` file in `backend/` folder:
GOOGLE_API_KEY=your_google_api_key_here
GROQ_API_KEY=your_groq_api_key_here
COHERE_API_KEY=your_cohere_api_key_here


### 4. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Email/Password
4. Enable **Realtime Database**
5. Download `firebase-credentials.json` from Project Settings → Service Accounts
6. Place in `backend/` folder

### 5. Firebase Database Rules

Set these rules in Firebase Realtime Database:
{
"rules": {
"chats": {
"$uid": {
".read": "auth.uid === $uid",
".write": "auth.uid === $uid"
}
}
}
}

### 6. Run Backend
cd backend
python -m uvicorn main:app --reload

### 7. Run Frontend
Open `frontend/chat.html` in your browser or use Live Server



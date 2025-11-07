from fastapi import FastAPI, HTTPException, UploadFile, File, Header, status
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, db as firebase_db
from pydantic import BaseModel
from typing import List, Optional, Dict
from dotenv import load_dotenv
import os
import re
import traceback
import logging
import json
from datetime import datetime


# Load environment variables
load_dotenv()


# ========== LOGGING SETUP ==========
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ========== API KEYS ==========
API_KEYS = {
    "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY", "AIzaSyC_UVXYN8xGqxh-IbpBHf93VF_bF_aUfB8"),
    "GROQ_API_KEY": os.getenv("GROQ_API_KEY"),
    "COHERE_API_KEY": os.getenv("COHERE_API_KEY")
}


# Configure Google Generative AI
try:
    import google.generativeai as genai
    if API_KEYS["GOOGLE_API_KEY"]:
        genai.configure(api_key=API_KEYS["GOOGLE_API_KEY"])
        logger.info("✅ Google Generative AI configured")
except ImportError:
    logger.warning("⚠️ google-generativeai not installed")
except Exception as e:
    logger.error(f"❌ Error configuring GenAI: {e}")


# ========== FIREBASE INITIALIZATION ==========
logger.info("=" * 80)
logger.info("🚀 FIREBASE ADMIN SDK INITIALIZATION")
logger.info("=" * 80)


firebase_initialized = False


try:
    if not os.path.exists("firebase-credentials.json"):
        raise FileNotFoundError("firebase-credentials.json not found in current directory")
    
    logger.info("✅ Found firebase-credentials.json")
    
    with open("firebase-credentials.json", "r") as f:
        cred_data = json.load(f)
    
    logger.info("✅ Valid JSON loaded")
    logger.info(f"📍 Project ID: {cred_data.get('project_id')}")
    
    cred = credentials.Certificate("firebase-credentials.json")
    # ⭐ FIXED: Use correct database URL
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://notex-8bdd7-default-rtdb.firebaseio.com'
    })
    firebase_initialized = True
    logger.info("✅ Firebase Admin SDK initialized successfully")
    
except FileNotFoundError as e:
    logger.error(f"❌ {e}")
    logger.warning("⚠️ Running without Firebase - chat persistence disabled")
except json.JSONDecodeError as e:
    logger.error(f"❌ Invalid JSON in firebase-credentials.json: {e}")
    raise
except Exception as e:
    logger.error(f"❌ Firebase initialization error: {e}")
    traceback.print_exc()
    raise


logger.info("=" * 80)


# ========== FASTAPI SETUP ==========
app = FastAPI(title="NoteX API", version="1.0.0")


# ========== CORS CONFIGURATION ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== PROMPTS ==========
VIDEO_PROMPT = """You are an elite educational content architect and master summarizer. Transform this YouTube video transcript into professional-grade study notes.

**TRANSCRIPT:**
"""


DOCUMENT_PROMPT = """You are a world-class educational content designer. Transform this document into premium-quality study notes.

**DOCUMENT CONTENT:**
"""


# ========== PYDANTIC MODELS ==========
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict]] = []
    model: str = "Google Gemini"
    context: Optional[str] = None


class YouTubeRequest(BaseModel):
    url: str
    model: str = "Google Gemini"


class SaveChatRequest(BaseModel):
    chatId: str
    title: str
    messages: List[Dict] = []
    context: Optional[str] = None


class ShareChatRequest(BaseModel):
    chatId: str
    shareToken: str


# ========== FIREBASE HELPER FUNCTIONS ==========
def verify_firebase_token(authorization: str):
    """Verify Firebase ID token"""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No authorization header")
    
    try:
        token = authorization[7:].strip() if authorization.startswith("Bearer ") else authorization.strip()
        
        if not token or len(token) < 100:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
        
        decoded_token = firebase_auth.verify_id_token(token)
        logger.info(f"✅ Token verified for: {decoded_token.get('email')}")
        return decoded_token
        
    except firebase_auth.InvalidIdTokenError as e:
        logger.error(f"❌ Invalid token: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        logger.error(f"❌ Token verification failed: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


# ========== DOCUMENT PROCESSING ==========
def extract_video_id(youtube_url: str) -> str:
    """Extract video ID from YouTube URL"""
    youtube_regex = (
        r'(https?://)?(www\.)?'
        r'(youtube|youtu|youtube-nocookie)\.(com|be)/'
        r'(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
    )
    match = re.search(youtube_regex, youtube_url)
    return match.group(6) if match else None


def get_transcript_from_youtube(youtube_url: str) -> str:
    """Get transcript from YouTube video"""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        
        video_id = extract_video_id(youtube_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
        logger.info(f"📥 Fetching transcript for video: {video_id}")
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.fetch(video_id)
        transcript = " ".join([snippet['text'] for snippet in transcript_list])
        logger.info(f"✅ Transcript fetched (length: {len(transcript)})")
        return transcript
    except ImportError:
        raise HTTPException(status_code=500, detail="youtube-transcript-api not installed")
    except Exception as e:
        logger.error(f"❌ Error fetching transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Transcript error: {str(e)}")


def extract_text_from_pdf(pdf_file) -> str:
    """Extract text from PDF"""
    try:
        import PyPDF2
        logger.info("📄 Extracting text from PDF")
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        text = "\n".join(page.extract_text() for page in pdf_reader.pages if page.extract_text())
        return text.strip()
    except ImportError:
        raise HTTPException(status_code=500, detail="PyPDF2 not installed")
    except Exception as e:
        logger.error(f"❌ Error reading PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def extract_text_from_docx(docx_file) -> str:
    """Extract text from DOCX"""
    try:
        from docx import Document
        logger.info("📄 Extracting text from DOCX")
        doc = Document(docx_file)
        text = "\n".join(para.text for para in doc.paragraphs)
        return text.strip()
    except ImportError:
        raise HTTPException(status_code=500, detail="python-docx not installed")
    except Exception as e:
        logger.error(f"❌ Error reading DOCX: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== AI GENERATION ==========
def generate_summary(content_text: str, prompt: str, model_choice: str = "Google Gemini") -> str:
    """Generate summary using AI"""
    try:
        logger.info(f"🤖 Generating summary with: {model_choice}")
        
        if "Gemini" in model_choice or "Flash" in model_choice:
            try:
                model = genai.GenerativeModel("gemini-2.0-flash")
                response = model.generate_content(prompt + content_text[:10000])
                return response.text if response.text else "Unable to generate summary"
            except Exception as e:
                logger.error(f"❌ Gemini error: {e}")
                raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
        else:
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt + content_text[:10000])
            return response.text if response.text else "Unable to generate summary"
    except Exception as e:
        logger.error(f"❌ Error generating summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def generate_chat_response(message: str, history: List[Dict], model_choice: str = "Google Gemini", context: Optional[str] = None) -> str:
    """Generate chat response using AI"""
    try:
        logger.info(f"💬 Generating response with: {model_choice}")
        
        try:
            model = genai.GenerativeModel("gemini-2.0-flash")
            
            # Build history
            gemini_history = []
            for msg in history:
                role = "user" if msg.get("role") == "user" else "model"
                gemini_history.append({"role": role, "parts": [msg.get("content", "")]})
            
            chat = model.start_chat(history=gemini_history)
            full_message = f"Context:\n{context[:2000]}\n\nQuestion: {message}" if context else message
            response = chat.send_message(full_message)
            return response.text if response.text else "No response generated"
        except Exception as e:
            logger.error(f"❌ Gemini chat error: {e}")
            raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error generating response: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== API ENDPOINTS ==========
@app.get("/")
async def root():
    return {"message": "✅ NoteX API is running", "version": "1.0.0"}


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "firebase": "initialized" if firebase_initialized else "not initialized",
        "google_api": bool(API_KEYS["GOOGLE_API_KEY"])
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat endpoint"""
    try:
        response_text = generate_chat_response(
            request.message,
            request.history,
            request.model,
            request.context
        )
        return {"success": True, "message": response_text}
    except Exception as e:
        logger.error(f"❌ Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/summarize/youtube")
async def summarize_youtube(request: YouTubeRequest):
    """Summarize YouTube video"""
    try:
        logger.info(f"🎥 YouTube URL: {request.url}")
        
        transcript = get_transcript_from_youtube(request.url)
        logger.info(f"✅ Transcript length: {len(transcript)}")
        
        summary = generate_summary(transcript, VIDEO_PROMPT, request.model)
        logger.info(f"✅ Summary generated")
        
        return {"success": True, "summary": summary}
    except Exception as e:
        logger.error(f"❌ YouTube error: {e}")
        logger.error(f"   Type: {type(e)}")
        logger.error(f"   Details: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/summarize/document")
async def summarize_document(file: UploadFile = File(...), model: str = "Google Gemini"):
    """Summarize document (PDF/DOCX)"""
    try:
        import io
        filename = file.filename.lower()
        content = await file.read()
        file_obj = io.BytesIO(content)
        
        if filename.endswith('.pdf'):
            text = extract_text_from_pdf(file_obj)
        elif filename.endswith('.docx') or filename.endswith('.doc'):
            text = extract_text_from_docx(file_obj)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use PDF or DOCX")
        
        if not text:
            raise HTTPException(status_code=400, detail="No text content found")
        
        summary = generate_summary(text, DOCUMENT_PROMPT, model)
        return {"success": True, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chats/save")
async def save_chat(request: SaveChatRequest, authorization: str = Header(None)):
    """Save chat to Firebase"""
    try:
        current_user = verify_firebase_token(authorization)
        uid = current_user['uid']
        
        logger.info(f"💾 Saving chat for user: {uid}")
        logger.info(f"   Title: {request.title}")
        logger.info(f"   Chat ID: {request.chatId}")
        
        chat_data = {
            "title": request.title,
            "messages": request.messages,
            "context": request.context,
            "timestamp": datetime.now().isoformat(),
            "uid": uid
        }
        
        ref = firebase_db.reference(f"chats/{uid}/{request.chatId}")
        ref.set(chat_data)
        
        logger.info(f"✅ Chat saved: {request.chatId}")
        return {"success": True, "chatId": request.chatId}
    except Exception as e:
        logger.error(f"❌ Error saving chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chats")
async def get_chats(authorization: str = Header(None)):
    """Get all chats for user"""
    try:
        current_user = verify_firebase_token(authorization)
        uid = current_user['uid']
        
        logger.info(f"📂 Fetching chats for user: {uid}")
        
        ref = firebase_db.reference(f"chats/{uid}")
        chats = ref.get()
        
        logger.info(f"   Raw data: {chats}")
        
        if not chats:
            logger.info("   No chats found")
            return {"success": True, "chats": []}
        
        chat_list = [
            {"id": chat_id, **chat_data}
            for chat_id, chat_data in chats.items()
        ]
        
        logger.info(f"✅ Loaded {len(chat_list)} chats")
        return {"success": True, "chats": chat_list}
    except Exception as e:
        logger.error(f"❌ Error fetching chats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str, authorization: str = Header(None)):
    """Get specific chat"""
    try:
        current_user = verify_firebase_token(authorization)
        uid = current_user['uid']
        
        ref = firebase_db.reference(f"chats/{uid}/{chat_id}")
        chat = ref.get()
        
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        return {"success": True, "chat": {"id": chat_id, **chat}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str, authorization: str = Header(None)):
    """Delete a chat"""
    try:
        current_user = verify_firebase_token(authorization)
        uid = current_user['uid']
        
        logger.info(f"🗑️ Deleting chat: {chat_id}")
        
        ref = firebase_db.reference(f"chats/{uid}/{chat_id}")
        ref.delete()
        
        logger.info(f"✅ Chat deleted: {chat_id}")
        return {"success": True, "message": "Chat deleted"}
    except Exception as e:
        logger.error(f"❌ Error deleting chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chats/{chat_id}/share")
async def share_chat(chat_id: str, request: ShareChatRequest, authorization: str = Header(None)):
    """Share chat"""
    try:
        current_user = verify_firebase_token(authorization)
        uid = current_user['uid']
        
        logger.info(f"🔗 Generating share link for: {chat_id}")
        
        ref = firebase_db.reference(f"shared_chats/{request.shareToken}")
        shared_data = {
            "chatId": chat_id,
            "uid": uid,
            "timestamp": datetime.now().isoformat()
        }
        ref.set(shared_data)
        
        return {"success": True, "shareToken": request.shareToken}
    except Exception as e:
        logger.error(f"❌ Error sharing chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting NoteX API server")
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)

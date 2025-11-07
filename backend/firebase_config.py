import firebase_admin
from firebase_admin import credentials, auth
import os

# Initialize Firebase Admin SDK
cred = credentials.Certificate("firebase-credentials.json")  # Path to your service account key
firebase_admin.initialize_app(cred)

def verify_firebase_token(id_token: str):
    """
    Verify Firebase ID token and return decoded token
    """
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        raise ValueError(f"Invalid token: {str(e)}")

def get_user_by_uid(uid: str):
    """
    Get user information from Firebase by UID
    """
    try:
        user = auth.get_user(uid)
        return user
    except Exception as e:
        raise ValueError(f"User not found: {str(e)}")

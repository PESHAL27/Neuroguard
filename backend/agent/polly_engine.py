try:
    import boto3
except ImportError:
    boto3 = None
import os
import base64
from dotenv import load_dotenv

load_dotenv(dotenv_path="../frontend/.env.local")

# Amazon Polly Client
# We use the region from env or fallback to us-east-1
def get_polly():
    if not boto3:
        return None
    return boto3.client(
        'polly',
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("BEDROCK_REGION", "us-east-1")
    )

def synthesize_speech(text: str) -> str:
    """
    Takes AI text and converts it into a base64 MP3 using Amazon Polly.
    We request an Neural Indian English voice for premium professional quality.
    """
    try:
        polly = get_polly()
        
        # 'Kajal' is a premium Neural Indian English female voice. 
        # Alternatively, 'Aditi' is standard Indian English.
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat='mp3',
            VoiceId='Kajal',
            Engine='neural'
        )
        
        # Read the audio stream
        audio_stream = response['AudioStream'].read()
        
        # Convert audio bytes to base64 so we can easily send it to the frontend in a JSON response
        audio_base64 = base64.b64encode(audio_stream).decode('utf-8')
        return audio_base64
        
    except Exception as e:
        print(f"Amazon Polly Error: {e}")
        return None

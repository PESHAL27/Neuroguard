import os
import socket
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import certifi
from dotenv import load_dotenv

# Load env from .env first (Docker), fall back to frontend/.env.local (dev)
load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local")

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "neurogaurd")

# Auto-detect: Atlas (mongodb+srv://) needs TLS, local MongoDB does not
_is_atlas = MONGO_URI and MONGO_URI.startswith("mongodb+srv://")

def _check_local_mongo() -> bool:
    if _is_atlas:
        return True
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.05)
        res = s.connect_ex(("127.0.0.1", 27017))
        s.close()
        return res == 0
    except Exception:
        return False

is_mongo_alive = _check_local_mongo()

if _is_atlas:
    ca = certifi.where()
    _conn_opts = dict(
        tlsCAFile=ca,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=10000,
    )
elif is_mongo_alive:
    _conn_opts = dict(serverSelectionTimeoutMS=1500)
else:
    _conn_opts = dict(serverSelectionTimeoutMS=50)

# Async client for FastAPI + WebSockets
client = AsyncIOMotorClient(MONGO_URI, **_conn_opts) if is_mongo_alive or _is_atlas else None
db = client[DB_NAME] if client is not None else None

# Synchronous client for agent logic
sync_client = MongoClient(MONGO_URI, **_conn_opts) if is_mongo_alive or _is_atlas else None
sync_db = sync_client[DB_NAME] if sync_client is not None else None

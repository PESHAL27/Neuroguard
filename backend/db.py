import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import certifi
from dotenv import load_dotenv

# Load env from .env first (Docker), fall back to frontend/.env.local (dev)
load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local")

MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB", "neurogaurd")

# Auto-detect: Atlas (mongodb+srv://) needs TLS, local MongoDB does not
_is_atlas = MONGO_URI and MONGO_URI.startswith("mongodb+srv://")

if _is_atlas:
    ca = certifi.where()
    _conn_opts = dict(
        tlsCAFile=ca,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=10000,
    )
else:
    _conn_opts = dict(serverSelectionTimeoutMS=1500)

# Async client for FastAPI + WebSockets
client = AsyncIOMotorClient(MONGO_URI, **_conn_opts)
db = client[DB_NAME]

# Synchronous client for agent logic (since tools are sync)
sync_client = MongoClient(MONGO_URI, **_conn_opts)
sync_db = sync_client[DB_NAME]

import os
import json
import re
import copy
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

# Load env from .env first, fall back to frontend/.env.local
load_dotenv()
_backend_dir = Path(__file__).resolve().parent
_frontend_env = _backend_dir.parent / "frontend" / ".env.local"
if _frontend_env.exists():
    load_dotenv(dotenv_path=str(_frontend_env))

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "neurogaurd")

_is_atlas = bool(MONGO_URI and MONGO_URI.startswith("mongodb+srv://"))


def _matches_query(doc: dict, query: dict) -> bool:
    if not query:
        return True

    for k, v in query.items():
        if k == "$or":
            if not any(_matches_query(doc, sub_q) for sub_q in v):
                return False
            continue
        if k == "$and":
            if not all(_matches_query(doc, sub_q) for sub_q in v):
                return False
            continue

        doc_val = doc.get(k)
        if isinstance(v, dict):
            if "$in" in v:
                if doc_val not in v["$in"]:
                    return False
            if "$ne" in v:
                if doc_val == v["$ne"]:
                    return False
            if "$exists" in v:
                exists = k in doc
                if exists != bool(v["$exists"]):
                    return False
            if "$regex" in v:
                pattern = v["$regex"]
                flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                if not doc_val or not re.search(pattern, str(doc_val), flags):
                    return False
        else:
            if doc_val != v:
                return False
    return True


def _project_doc(doc: dict, projection: Optional[dict]) -> dict:
    if not projection:
        return copy.deepcopy(doc)
    
    # Simple inclusion / exclusion projection
    is_inclusion = any(v for k, v in projection.items() if k != "_id")
    if is_inclusion:
        res = {}
        if projection.get("_id", 1):
            if "_id" in doc:
                res["_id"] = doc["_id"]
        for k, v in projection.items():
            if k != "_id" and v and k in doc:
                res[k] = doc[k]
        return res
    else:
        res = copy.deepcopy(doc)
        for k, v in projection.items():
            if not v and k in res:
                del res[k]
        return res


class InMemoryCursor:
    def __init__(self, data: List[dict], projection: Optional[dict] = None):
        self._data = [copy.deepcopy(d) for d in data]
        self._projection = projection
        self._sort_key = None
        self._sort_dir = 1
        self._limit_val = None
        self._skip_val = 0
        self._idx = 0

    def sort(self, key_or_list, direction=1):
        if isinstance(key_or_list, list):
            if key_or_list:
                self._sort_key, self._sort_dir = key_or_list[0]
        else:
            self._sort_key = key_or_list
            self._sort_dir = direction
        return self

    def limit(self, n: int):
        self._limit_val = n
        return self

    def skip(self, n: int):
        self._skip_val = n
        return self

    def _get_results(self) -> List[dict]:
        res = self._data[:]
        if self._sort_key:
            res.sort(
                key=lambda x: str(x.get(self._sort_key, "")),
                reverse=(self._sort_dir == -1)
            )
        if self._skip_val:
            res = res[self._skip_val:]
        if self._limit_val is not None:
            res = res[:self._limit_val]
        return [_project_doc(d, self._projection) for d in res]

    async def to_list(self, length: Optional[int] = None) -> List[dict]:
        results = self._get_results()
        if length is not None:
            return results[:length]
        return results

    def __iter__(self):
        return iter(self._get_results())

    def __aiter__(self):
        self._iter_data = self._get_results()
        self._iter_idx = 0
        return self

    async def __anext__(self):
        if self._iter_idx < len(self._iter_data):
            val = self._iter_data[self._iter_idx]
            self._iter_idx += 1
            return val
        raise StopAsyncIteration


class InMemoryCollection:
    def __init__(self, name: str, db_parent):
        self.name = name
        self.db = db_parent
        self.docs: List[dict] = []

    def find(self, filter: Optional[dict] = None, projection: Optional[dict] = None):
        filter = filter or {}
        matches = [d for d in self.docs if _matches_query(d, filter)]
        return InMemoryCursor(matches, projection)

    async def find_one(self, filter: Optional[dict] = None, projection: Optional[dict] = None):
        filter = filter or {}
        for d in self.docs:
            if _matches_query(d, filter):
                return _project_doc(d, projection)
        return None

    def find_one_sync(self, filter: Optional[dict] = None, projection: Optional[dict] = None):
        filter = filter or {}
        for d in self.docs:
            if _matches_query(d, filter):
                return _project_doc(d, projection)
        return None

    async def insert_one(self, document: dict):
        doc = copy.deepcopy(document)
        if "_id" not in doc:
            doc["_id"] = str(uuid.uuid4())
        self.docs.append(doc)
        self.db._save_disk()
        class Result:
            inserted_id = doc["_id"]
        return Result()

    def insert_one_sync(self, document: dict):
        doc = copy.deepcopy(document)
        if "_id" not in doc:
            doc["_id"] = str(uuid.uuid4())
        self.docs.append(doc)
        self.db._save_disk()
        class Result:
            inserted_id = doc["_id"]
        return Result()

    async def insert_many(self, documents: List[dict]):
        for d in documents:
            await self.insert_one(d)

    async def update_one(self, filter: dict, update: dict, upsert: bool = False):
        return self._update_one_internal(filter, update, upsert)

    def update_one_sync(self, filter: dict, update: dict, upsert: bool = False):
        return self._update_one_internal(filter, update, upsert)

    def _update_one_internal(self, filter: dict, update: dict, upsert: bool = False):
        for d in self.docs:
            if _matches_query(d, filter):
                if "$set" in update:
                    d.update(update["$set"])
                if "$setOnInsert" in update:
                    pass
                self.db._save_disk()
                class Result:
                    modified_count = 1
                    upserted_id = None
                return Result()

        if upsert:
            new_doc = copy.deepcopy(filter)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            if "_id" not in new_doc:
                new_doc["_id"] = str(uuid.uuid4())
            self.docs.append(new_doc)
            self.db._save_disk()
            class Result:
                modified_count = 1
                upserted_id = new_doc["_id"]
            return Result()

        class Result:
            modified_count = 0
            upserted_id = None
        return Result()

    async def delete_one(self, filter: dict):
        return self.delete_one_sync(filter)

    def delete_one_sync(self, filter: dict):
        for i, d in enumerate(self.docs):
            if _matches_query(d, filter):
                del self.docs[i]
                self.db._save_disk()
                class Result:
                    deleted_count = 1
                return Result()
        class Result:
            deleted_count = 0
        return Result()

    async def delete_many(self, filter: dict):
        return self.delete_many_sync(filter)

    def delete_many_sync(self, filter: dict):
        orig_len = len(self.docs)
        self.docs = [d for d in self.docs if not _matches_query(d, filter)]
        deleted_count = orig_len - len(self.docs)
        if deleted_count > 0:
            self.db._save_disk()
        class Result:
            pass
        res = Result()
        res.deleted_count = deleted_count
        return res

    async def update_many(self, filter: dict, update: dict):
        return self.update_many_sync(filter, update)

    def update_many_sync(self, filter: dict, update: dict):
        mod_count = 0
        for d in self.docs:
            if _matches_query(d, filter):
                if "$set" in update:
                    d.update(update["$set"])
                mod_count += 1
        if mod_count > 0:
            self.db._save_disk()
        class Result:
            pass
        res = Result()
        res.modified_count = mod_count
        return res

    async def count_documents(self, filter: Optional[dict] = None) -> int:
        filter = filter or {}
        return sum(1 for d in self.docs if _matches_query(d, filter))

    def count_documents_sync(self, filter: Optional[dict] = None) -> int:
        filter = filter or {}
        return sum(1 for d in self.docs if _matches_query(d, filter))


class InMemoryDB:
    def __init__(self, db_name: str = "neurogaurd"):
        self.name = db_name
        self.collections: Dict[str, InMemoryCollection] = {}
        self._data_file = _backend_dir / "data" / "local_mock_db.json"
        self._load_disk()
        self._seed_defaults()

    def __getattr__(self, name: str) -> InMemoryCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryCollection(name, self)
        return self.collections[name]

    def __getitem__(self, name: str) -> InMemoryCollection:
        return getattr(self, name)

    def list_collection_names(self) -> List[str]:
        return list(self.collections.keys())

    def _save_disk(self):
        try:
            self._data_file.parent.mkdir(parents=True, exist_ok=True)
            export_data = {}
            for col_name, col in self.collections.items():
                export_data[col_name] = col.docs
            with open(self._data_file, "w", encoding="utf-8") as f:
                json.dump(export_data, f, indent=2, default=str)
        except Exception:
            pass

    def _load_disk(self):
        if self._data_file.exists():
            try:
                with open(self._data_file, "r", encoding="utf-8") as f:
                    import_data = json.load(f)
                    for col_name, docs in import_data.items():
                        col = getattr(self, col_name)
                        col.docs = docs
            except Exception:
                pass

    def _seed_defaults(self):
        # Load live devices into devices collection if empty
        if not self.devices.docs:
            live_dev_file = _backend_dir / "data" / "live_devices.json"
            if live_dev_file.exists():
                try:
                    with open(live_dev_file, "r", encoding="utf-8") as f:
                        devs = json.load(f)
                        if isinstance(devs, list):
                            self.devices.docs = devs
                except Exception:
                    pass
            # Filter out any non-live or imaginary placeholder devices
            self.devices.docs = [
                d for d in self.devices.docs 
                if d.get("ip") and not d.get("ip", "").startswith("104.") and d.get("ip") != "192.168.137.50"
            ]


class SyncInMemoryCollectionWrapper:
    def __init__(self, in_mem_col: InMemoryCollection):
        self._col = in_mem_col

    def find(self, filter: Optional[dict] = None, projection: Optional[dict] = None):
        return self._col.find(filter, projection)

    def find_one(self, filter: Optional[dict] = None, projection: Optional[dict] = None):
        return self._col.find_one_sync(filter, projection)

    def insert_one(self, document: dict):
        return self._col.insert_one_sync(document)

    def update_one(self, filter: dict, update: dict, upsert: bool = False):
        return self._col.update_one_sync(filter, update, upsert)

    def delete_one(self, filter: dict):
        return self._col.delete_one_sync(filter)

    def delete_many(self, filter: dict):
        return self._col.delete_many_sync(filter)

    def update_many(self, filter: dict, update: dict):
        return self._col.update_many_sync(filter, update)

    def count_documents(self, filter: Optional[dict] = None) -> int:
        return self._col.count_documents_sync(filter)


class SyncInMemoryDBWrapper:
    def __init__(self, in_mem_db: InMemoryDB):
        self._db = in_mem_db

    def __getattr__(self, name: str) -> SyncInMemoryCollectionWrapper:
        col = getattr(self._db, name)
        return SyncInMemoryCollectionWrapper(col)

    def __getitem__(self, name: str) -> SyncInMemoryCollectionWrapper:
        return getattr(self, name)


def _check_mongo_connection() -> bool:
    if not MONGO_URI:
        return False
    try:
        if _is_atlas:
            ca = certifi.where()
            test_client = MongoClient(
                MONGO_URI,
                tlsCAFile=ca,
                tlsAllowInvalidCertificates=True,
                serverSelectionTimeoutMS=800,
                connectTimeoutMS=800,
            )
        else:
            test_client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=500,
                connectTimeoutMS=500,
            )
        test_client.admin.command("ping")
        test_client.close()
        return True
    except Exception as e:
        print(f"[MongoDB] Standalone mode: Remote MongoDB is offline/unreachable ({e.__class__.__name__}). Using high-performance local data engine.")
        return False


is_mongo_alive = _check_mongo_connection()

if is_mongo_alive:
    if _is_atlas:
        ca = certifi.where()
        _conn_opts = dict(
            tlsCAFile=ca,
            tlsAllowInvalidCertificates=True,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
        )
    else:
        _conn_opts = dict(serverSelectionTimeoutMS=1000, connectTimeoutMS=1000)
    
    client = AsyncIOMotorClient(MONGO_URI, **_conn_opts)
    db = client[DB_NAME]
    sync_client = MongoClient(MONGO_URI, **_conn_opts)
    sync_db = sync_client[DB_NAME]
else:
    # High-Performance Local In-Memory & JSON database
    _in_memory_db = InMemoryDB(DB_NAME)
    db = _in_memory_db
    sync_db = SyncInMemoryDBWrapper(_in_memory_db)
    client = None
    sync_client = None

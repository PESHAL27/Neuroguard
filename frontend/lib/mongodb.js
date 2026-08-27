import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/neuroguard";
const options = {};

let client;
let clientPromise;

try {
    if (process.env.NODE_ENV === "development") {
        if (!global._mongoClientPromise) {
            client = new MongoClient(uri, options);
            global._mongoClientPromise = client.connect().catch((err) => {
                console.warn("[MongoDB] Connection warning:", err.message);
                return null;
            });
        }
        clientPromise = global._mongoClientPromise;
    } else {
        client = new MongoClient(uri, options);
        clientPromise = client.connect().catch((err) => {
            console.warn("[MongoDB] Connection warning:", err.message);
            return null;
        });
    }
} catch (e) {
    console.warn("[MongoDB] Client init notice:", e.message);
    clientPromise = Promise.resolve(null);
}

export default clientPromise;


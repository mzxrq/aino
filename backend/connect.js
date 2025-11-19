const { MongoClient } = require('mongodb');

const client = new MongoClient("mongodb://127.0.0.1:27017");

let database;

module.exports = {
    connectToServer: async () => {
        try {
            await client.connect();
            database = client.db("Test");
            console.log("Connected to Docker MongoDB");
        } catch (err) {
            console.error("MongoDB Docker connection error:", err);
        }
    },

    getDb: () => database
};

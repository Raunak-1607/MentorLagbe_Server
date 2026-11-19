import express from "express"
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";

const app = express()
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// const client = new MongoClient("mongodb://MentorLagbe:x2psIuqut33GcVVS@ac-h7jp6yr-shard-00-00.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-01.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-02.iqsbflj.mongodb.net:27017/?ssl=true&replicaSet=atlas-7ljhir-shard-0&authSource=admin")
// const db = client.db("MentorLagbe");

const client = new MongoClient("mongodb://MentorLagbe:x2psIuqut33GcVVS@ac-h7jp6yr-shard-00-00.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-01.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-02.iqsbflj.mongodb.net:27017/?ssl=true&replicaSet=atlas-7ljhir-shard-0&authSource=admin");
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

connectToMongoDB();

// MentorLagbe
// x2psIuqut33GcVVS

mongodb://MentorLagbe:x2psIuqut33GcVVS@ac-h7jp6yr-shard-00-00.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-01.iqsbflj.mongodb.net:27017,ac-h7jp6yr-shard-00-02.iqsbflj.mongodb.net:27017/?ssl=true&replicaSet=atlas-7ljhir-shard-0&authSource=admin

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
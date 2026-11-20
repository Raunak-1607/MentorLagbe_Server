import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

let db;
let tuitions;
let users;

async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("Successfully connected to MongoDB!");

    db = client.db("MentorLagbe");
    tuitions = db.collection("tuition");
    users = db.collection("user");

  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users" , async(req,res)=>{
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
} )

app.patch("/users/:id" , async(req , res)=>{
  const {id} = req.params;
  const data = req.body;
  const filter = {_id: new ObjectId(id)}
  const result = await users.updateOne(
    filter,
    {
      $set : data
    }
  )
  res.send(result);
})

app.get("/tuition" , async(req,res)=>{
  const cursor = tuitions.find({});
  const result = await cursor.toArray();
  res.send(result);
} )

app.post("/tuitions", async (req, res) => {
  const {
    title,
    subject,
    classLevel,
    mode,
    location,
    monthlyFee,
    daysPerWeek,
    bannerImage,
    description,
    tutorName,
    tutorEmail,
  } = req.body;

  if (!title || !subject || !classLevel || !location || !description || !tutorName || !tutorEmail) {
    return res.status(400).send({ message: "Please fill in all required fields." });
  }

  if (mode !== "Online" && mode !== "Offline") {
    return res.status(400).send({ message: "Mode must be Online or Offline." });
  }

  const tuition = {
    id: new ObjectId().toString(),
    title,
    subject,
    classLevel,
    mode,
    location,
    monthlyFee: Number(monthlyFee),
    daysPerWeek: Number(daysPerWeek),
    bannerImage: bannerImage || "",
    description,
    tutorName,
    tutorEmail,
    approvalStatus: "pending",
    isActive: true,
    createdAt: new Date(),
  };

  const result = await tuitions.insertOne(tuition);
  res.status(201).send({ message: "Tuition created successfully.", insertedId: result.insertedId });
});



// Start server after MongoDB connection
async function startServer() {
  await connectToMongoDB();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();

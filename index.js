import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

let db;
let tuitions;
let users;
let payments;
let applications;
// let payments:

async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("Successfully connected to MongoDB!");

    db = client.db("MentorLagbe");
    tuitions = db.collection("tuition");
    users = db.collection("user");
    payments = db.collection("payments");
    applications = db.collection("applications");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users", async (req, res) => {
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
});

app.patch("/users/:id", async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const filter = { _id: new ObjectId(id) };
  const result = await users.updateOne(filter, {
    $set: data,
  });
  res.send(result);
});

app.get("/tuition", async (req, res) => {
  const { email } = req.query;
  const filter = email ? { tutorEmail: email } : {};
  const cursor = tuitions.find(filter);
  const result = await cursor.toArray();
  res.send(result);
});

// 1. PATCH /tuition/:id (Handles editing fields and closing/reopening isActive)
app.patch("/tuition/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    let filter;
    try {
      filter = { _id: new ObjectId(id) };
    } catch {
      filter = { id: id };
    }

    const result = await tuitions.updateOne(filter, {
      $set: updateData,
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// 2. DELETE /tuition/:id (Handles deleting a tuition post)
app.delete("/tuition/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let filter;
    try {
      filter = { _id: new ObjectId(id) };
    } catch {
      filter = { id: id };
    }

    const result = await tuitions.deleteOne(filter);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/tuition/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await tuitions.findOne(query);
  res.send(result);
});

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

  if (
    !title ||
    !subject ||
    !classLevel ||
    !location ||
    !description ||
    !tutorName ||
    !tutorEmail
  ) {
    return res
      .status(400)
      .send({ message: "Please fill in all required fields." });
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
  res
    .status(201)
    .send({
      message: "Tuition created successfully.",
      insertedId: result.insertedId,
    });
});

app.post("/payments", async (req, res) => {
  const { sessionId } = req.body;
  const {
    status,
    payment_status,
    customer_email,
    customer_details,
    metadata,
    payment_intent,
  } = await stripe.checkout.sessions.retrieve(sessionId);

  if (status === "complete" && payment_status == "paid") {
    const sessionQuery = { sessionId };
    const existingPayment = await payments.findOne(sessionQuery);
    if (existingPayment) {
      return res.send({ success: false, message: "Payment already verified" });
    }
    const payment = {
      sessionId,
      status,
      payment_status,
      customer_email,
      customer_details,
      userId: metadata.userId,
      payment_date: new Date(),
      payment_intent,
    };
    const result = await payments.insertOne(payment);

    const query = { _id: new ObjectId(metadata.userId) };
    const updatedDoc = {
      $set: {
        plan: "pro",
      },
    };

    const updateResult = await users.updateOne(query, updatedDoc);

    res.send({ success: true, result, updateResult });
    return;
  }

  res.send({ success: false, message: "payment verification failed" });
});

// 1. Get applications (can filter by studentEmail, tutorEmail, or tuitionId)
app.get("/applications", async (req, res) => {
  const { studentEmail, tutorEmail, tuitionId } = req.query;
  const filter = {};
  if (studentEmail) filter.studentEmail = studentEmail;
  if (tutorEmail) filter.tutorEmail = tutorEmail;
  if (tuitionId) filter.tuitionId = tuitionId;

  const cursor = applications.find(filter);
  const result = await cursor.toArray();
  res.send(result);
});

// 2. Post new student tuition application
app.post("/applications", async (req, res) => {
  const {
    tuitionId,
    tuitionTitle,
    subject,
    monthlyFee,
    tutorEmail,
    studentName,
    studentEmail,
    studentPhone,
    preferredSchedule,
    studentNote,
  } = req.body;

  if (!tuitionId || !studentPhone || !preferredSchedule || !studentEmail) {
    return res.status(400).send({ message: "Required fields missing." });
  }

  // Prevent duplicate application from same student for same tuition
  const existing = await applications.findOne({ tuitionId, studentEmail });
  if (existing) {
    return res
      .status(400)
      .send({ message: "You have already applied for this tuition." });
  }

  const application = {
    tuitionId,
    tuitionTitle,
    subject,
    monthlyFee: Number(monthlyFee),
    tutorEmail,
    studentName,
    studentEmail,
    studentPhone,
    preferredSchedule,
    studentNote: studentNote || "",
    status: "pending",
    appliedAt: new Date(),
  };

  const result = await applications.insertOne(application);
  res
    .status(201)
    .send({
      message: "Application submitted successfully.",
      insertedId: result.insertedId,
    });
});

// Update application decision (accept or reject)
app.patch("/applications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Supports both ObjectId and string id
    let filter;
    try {
      filter = { _id: new ObjectId(id) };
    } catch {
      filter = { id: id };
    }

    const result = await applications.updateOne(filter, {
      $set: { status },
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// Start server after MongoDB connection
async function startServer() {
  await connectToMongoDB();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();

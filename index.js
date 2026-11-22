import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ─── JWT Middleware ───────────────────────────────────────────────────────────
// Better Auth exposes its public JWKS at /api/auth/jwks
const jwksCache = new Map();

function getJWKSForOrigin(originUrl) {
  const cleanUrl = originUrl.replace(/\/+$/, "");
  if (!jwksCache.has(cleanUrl)) {
    jwksCache.set(
      cleanUrl,
      createRemoteJWKSet(new URL(`${cleanUrl}/api/auth/jwks`))
    );
  }
  return jwksCache.get(cleanUrl);
}

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["authentication"];

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized: No token provided" });
  }

  // Accept both "Bearer <token>" and "Barer <token>"
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: Malformed token" });
  }

  // Gather all possible origins for JWKS verification
  const candidateOrigins = new Set();

  if (req.headers.origin) {
    candidateOrigins.add(req.headers.origin.replace(/\/+$/, ""));
  }
  if (req.headers.referer) {
    try {
      candidateOrigins.add(new URL(req.headers.referer).origin.replace(/\/+$/, ""));
    } catch {}
  }
  try {
    const decoded = decodeJwt(token);
    if (decoded?.iss) {
      candidateOrigins.add(decoded.iss.replace(/\/+$/, ""));
    }
  } catch {}
  if (process.env.NEXT_PUBLIC_APP_URL) {
    candidateOrigins.add(process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""));
  }
  candidateOrigins.add("https://mentor-lagbe-client-phi.vercel.app");
  candidateOrigins.add("http://localhost:3000");

  let lastError = null;
  for (const origin of candidateOrigins) {
    try {
      const jwks = getJWKSForOrigin(origin);
      const { payload } = await jwtVerify(token, jwks);
      req.user = payload; // attach decoded payload to request
      return next();
    } catch (err) {
      lastError = err;
    }
  }

  console.error("JWT verification failed for all candidate origins:", lastError?.message);
  return res.status(401).send({
    message: "Unauthorized: Invalid or expired token",
    error: lastError?.message,
  });
};
// ─────────────────────────────────────────────────────────────────────────────

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

    console.log("Successfully connected to MongoDB");

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
  const { email } = req.query;
  const filter = email ? { email } : {};
  const cursor = users.find(filter);
  const result = await cursor.toArray();
  res.send(result);
});

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let filter;
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
    } catch {
      filter = { $or: [{ _id: id }, { id: id }] };
    }
    const result = await users.findOne(filter);
    if (!result) return res.status(404).send({ message: "User not found" });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    // Remove immutable fields if present
    const { _id, id: bodyId, ...updateData } = data;

    let filter;
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
    } catch {
      filter = { $or: [{ _id: id }, { id: id }] };
    }

    const result = await users.updateOne(filter, {
      $set: updateData,
    });
    res.send(result);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send({ message: error.message });
  }
});

app.get("/tuition", async (req, res) => {
  const { email } = req.query;
  const filter = email ? { tutorEmail: email } : {};
  const cursor = tuitions.find(filter);
  const result = await cursor.toArray();
  res.send(result);
});

// 1. PATCH /tuition/:id (Handles editing fields and closing/reopening isActive)
app.patch("/tuition/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const { _id, id: bodyId, ...cleanUpdateData } = updateData;

    let filter;
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
    } catch {
      filter = { $or: [{ _id: id }, { id: id }] };
    }

    const result = await tuitions.updateOne(filter, {
      $set: cleanUpdateData,
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// 2. DELETE /tuition/:id (Handles deleting a tuition post)
app.delete("/tuition/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    let filter;
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
    } catch {
      filter = { $or: [{ _id: id }, { id: id }] };
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
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).send({ success: false, message: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const {
      status,
      payment_status,
      customer_email,
      customer_details,
      metadata,
      payment_intent,
      amount_total,
      currency,
    } = session;

    if (status === "complete" && payment_status === "paid") {
      const sessionQuery = { sessionId };
      const existingPayment = await payments.findOne(sessionQuery);
      if (existingPayment) {
        return res.send({ success: true, message: "Payment already verified", payment: existingPayment });
      }

      const userId = metadata?.userId;
      const payment = {
        sessionId,
        status,
        payment_status,
        customer_email,
        customer_details,
        userId: userId || "",
        payment_date: new Date(),
        payment_intent,
        amount_total,
        currency,
      };
      const result = await payments.insertOne(payment);

      // Update user plan to "pro"
      let updateResult = null;
      if (userId) {
        let userFilter;
        try {
          userFilter = { $or: [{ _id: new ObjectId(userId) }, { _id: userId }, { id: userId }] };
        } catch {
          userFilter = { $or: [{ _id: userId }, { id: userId }] };
        }
        updateResult = await users.updateOne(userFilter, { $set: { plan: "pro" } });
      }

      res.send({ success: true, result, updateResult });
      return;
    }

    res.status(400).send({ success: false, message: "Payment verification failed or unpaid" });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/payments", async (req, res) => {
  try {
    const { email, userId } = req.query;
    const filter = {};
    if (email) filter.customer_email = email;
    if (userId) filter.userId = userId;
    const result = await payments.find(filter).sort({ payment_date: -1 }).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
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
app.post("/applications", verifyToken, async (req, res) => {
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
app.patch("/applications/:id", verifyToken, async (req, res) => {
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

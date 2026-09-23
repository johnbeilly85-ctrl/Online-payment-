const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "Temuoffer";

let db;
let ordersCollection;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve website files
app.use(express.static(__dirname));

// Home page
app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => {
res.json({
success: true,
message: "Temuoffer server is running",
currency: "NZD",
database: db ? "connected" : "not connected"
});
});

// Submit order
app.post("/api/order", async (req, res) => {
try {
const {
name,
email,
phone,
address,
products,
total,
currency
} = req.body;

if (
  !name ||
  !email ||
  !phone ||
  !address ||
  !products ||
  total === undefined ||
  total === null
) {
  return res.status(400).json({
    success: false,
    message: "Please provide all required order information."
  });
}

if (!db || !ordersCollection) {
  return res.status(503).json({
    success: false,
    message: "Database is not connected. Please try again later."
  });
}

const order = {
  orderId: "TO-" + Date.now(),
  name: String(name),
  email: String(email),
  phone: String(phone),
  address: String(address),
  products,
  total: Number(total),
  currency: currency || "NZD",
  status: "Pending Payment",
  createdAt: new Date()
};

await ordersCollection.insertOne(order);

console.log("NEW TEMUOFFER ORDER:");
console.log(JSON.stringify(order, null, 2));

res.status(201).json({
  success: true,
  message: "Order received successfully.",
  orderId: order.orderId,
  order: {
    ...order,
    createdAt: order.createdAt.toISOString()
  }
});

} catch (error) {
console.error("Order Error:", error);

res.status(500).json({
  success: false,
  message: "Something went wrong while processing the order."
});

}
});

// Get all orders for admin dashboard
app.get("/api/orders", async (req, res) => {
try {
if (!db || !ordersCollection) {
return res.status(503).json({
success: false,
message: "Database is not connected."
});
}

const orders = await ordersCollection
  .find({})
  .sort({ createdAt: -1 })
  .toArray();

const formattedOrders = orders.map(order => ({
  orderId: order.orderId || "",
  fullName: order.fullName || order.name || "",
  email: order.email || "",
  phone: order.phone || "",
  deliveryAddress: order.deliveryAddress || order.address || "",
  productName:
    order.productName ||
    (Array.isArray(order.products) && order.products.length
      ? order.products.map(p => p.name || p.title || "Product").join(", ")
      : ""),
  quantity:
    order.quantity ||
    (Array.isArray(order.products) && order.products.length
      ? order.products.reduce(
          (sum, p) => sum + Number(p.quantity || 1),
          0
        )
      : 1),
  total: Number(order.total || 0),
  currency: order.currency || "NZD",
  status: order.status || "Pending Payment",
  createdAt: order.createdAt
}));

res.json({
  success: true,
  count: formattedOrders.length,
  orders: formattedOrders
});

} catch (error) {
console.error("Get Orders Error:", error);

res.status(500).json({
  success: false,
  message: "Unable to load orders."
});

}
});

// 404 API response
app.use("/api", (req, res) => {
res.status(404).json({
success: false,
message: "API endpoint not found."
});
});

// Connect to MongoDB and start server
async function startServer() {
try {
if (!MONGODB_URI) {
console.error("MONGODB_URI environment variable is missing.");
} else {
const client = new MongoClient(MONGODB_URI);

  await client.connect();

  db = client.db(DB_NAME);
  ordersCollection = db.collection("orders");

  console.log("MongoDB connected successfully.");
  console.log(`Database: ${DB_NAME}`);
  console.log("Collection: orders");
}

app.listen(PORT, () => {
  console.log(`Temuoffer server running on port ${PORT}`);
});

} catch (error) {
console.error("MongoDB Connection Error:", error);

app.listen(PORT, () => {
  console.log(`Temuoffer server running on port ${PORT}`);
  console.log("WARNING: Server started without MongoDB connection.");
});

}
}

startServer();

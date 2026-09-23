const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000;

// ===============================
// MONGODB CONFIGURATION
// ===============================
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "Temuoffer";

let db;
let ordersCollection;

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve website files
app.use(express.static(__dirname));

// ===============================
// HOME PAGE
// ===============================
app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
// HEALTH CHECK
// ===============================
app.get("/api/health", (req, res) => {
res.json({
success: true,
message: "Temuoffer server is running",
currency: "NZD",
database: db ? "connected" : "not connected"
});
});

// ===============================
// SUBMIT ORDER
// ===============================
app.post("/api/order", async (req, res) => {
try {
const {
name,
fullName,
email,
phone,
address,
deliveryAddress,
products,
total,
currency
} = req.body;

// Accept either name format
const customerName = String(fullName || name || "").trim();
const customerAddress = String(
  deliveryAddress || address || ""
).trim();

// Validate required information
if (
  !customerName ||
  !email ||
  !phone ||
  !customerAddress ||
  !products ||
  total === undefined ||
  total === null
) {
  return res.status(400).json({
    success: false,
    message: "Please provide all required order information."
  });
}

// Check database connection
if (!db || !ordersCollection) {
  return res.status(503).json({
    success: false,
    message: "Database is not connected. Please try again later."
  });
}

// Create order
const order = {
  orderId: "TO-" + Date.now(),

  // Save both formats so the admin dashboard
  // always has the correct customer information
  name: customerName,
  fullName: customerName,

  email: String(email).trim(),
  phone: String(phone).trim(),

  address: customerAddress,
  deliveryAddress: customerAddress,

  products: Array.isArray(products) ? products : [],

  total: Number(total),

  currency: String(currency || "NZD"),

  status: "Pending Payment",

  createdAt: new Date()
};

// Save to MongoDB
await ordersCollection.insertOne(order);

console.log("=================================");
console.log("NEW TEMUOFFER ORDER");
console.log("=================================");
console.log(JSON.stringify(order, null, 2));
console.log("=================================");

return res.status(201).json({
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

return res.status(500).json({
  success: false,
  message: "Something went wrong while processing the order."
});

}
});

// ===============================
// GET ALL ORDERS
// ADMIN DASHBOARD
// ===============================
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

const formattedOrders = orders.map(order => {

  const products = Array.isArray(order.products)
    ? order.products
    : [];

  const productName =
    order.productName ||
    products
      .map(product =>
        product.name ||
        product.title ||
        "Product"
      )
      .join(", ");

  const quantity =
    order.quantity ||
    products.reduce(
      (sum, product) =>
        sum + Number(product.quantity || 1),
      0
    ) || 1;

  return {
    orderId: order.orderId || "",

    fullName:
      order.fullName ||
      order.name ||
      "",

    email:
      order.email ||
      "",

    phone:
      order.phone ||
      "",

    deliveryAddress:
      order.deliveryAddress ||
      order.address ||
      "",

    productName,

    quantity,

    total:
      Number(order.total || 0),

    currency:
      order.currency ||
      "NZD",

    status:
      order.status ||
      "Pending Payment",

    createdAt:
      order.createdAt
        ? new Date(order.createdAt).toISOString()
        : null
  };
});

return res.json({
  success: true,
  count: formattedOrders.length,
  orders: formattedOrders
});

} catch (error) {
console.error("Get Orders Error:", error);

return res.status(500).json({
  success: false,
  message: "Unable to load orders."
});

}
});

// ===============================
// API 404
// ===============================
app.use("/api", (req, res) => {
res.status(404).json({
success: false,
message: "API endpoint not found."
});
});

// ===============================
// START SERVER
// ===============================
async function startServer() {
try {

if (!MONGODB_URI) {

  console.error(
    "MONGODB_URI environment variable is missing."
  );

  app.listen(PORT, () => {
    console.log(
      `Temuoffer server running on port ${PORT}`
    );
    console.log(
      "WARNING: Server started without MongoDB."
    );
  });

  return;
}

const client = new MongoClient(MONGODB_URI);

await client.connect();

db = client.db(DB_NAME);

ordersCollection =
  db.collection("orders");

console.log(
  "MongoDB connected successfully."
);

console.log(
  `Database: ${DB_NAME}`
);

console.log(
  "Collection: orders"
);

app.listen(PORT, () => {
  console.log(
    `Temuoffer server running on port ${PORT}`
  );
});

} catch (error) {

console.error(
  "MongoDB Connection Error:",
  error
);

app.listen(PORT, () => {
  console.log(
    `Temuoffer server running on port ${PORT}`
  );

  console.log(
    "WARNING: Server started without MongoDB connection."
  );
});

}
}

startServer();

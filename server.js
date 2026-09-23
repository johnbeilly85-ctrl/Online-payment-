const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

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
    currency: "NZD"
  });
});

// Receive orders
app.post("/api/order", (req, res) => {
  try {
    const { name, email, phone, address, products, total, currency } = req.body;

    if (!name || !email || !phone || !address || !products || !total) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required order information."
      });
    }

    const order = {
      orderId: "TO-" + Date.now(),
      name,
      email,
      phone,
      address,
      products,
      total,
      currency: currency || "NZD",
      status: "Pending Payment",
      createdAt: new Date().toISOString()
    };

    console.log("NEW TEMUOFFER ORDER:");
    console.log(JSON.stringify(order, null, 2));

    res.status(201).json({
      success: true,
      message: "Order received successfully.",
      orderId: order.orderId,
      order
    });

  } catch (error) {
    console.error("Order Error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while processing the order."
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

// Start server
app.listen(PORT, () => {
  console.log(`Temuoffer server running on port ${PORT}`);
});

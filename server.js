const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "Temuoffer";

let db;
let ordersCollection;
let productsCollection;

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
    server: "running",
    database: db ? "connected" : "not connected"
  });
});

// ===============================
// CREATE ORDER
// ===============================
app.post("/api/order", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

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

    const customerName = fullName || name;
    const customerAddress = deliveryAddress || address;

    if (!customerName || !email || !phone || !customerAddress) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone and delivery address are required."
      });
    }

    const order = {
      orderId: "TO-" + Date.now(),

      name: customerName,
      fullName: customerName,

      email,
      phone,

      address: customerAddress,
      deliveryAddress: customerAddress,

      products: Array.isArray(products) ? products : [],

      total: Number(total) || 0,
      currency: String(currency || "NZD"),

      status: "Pending Payment",

      createdAt: new Date()
    };

    await ordersCollection.insertOne(order);

    res.json({
      success: true,
      message: "Order received successfully.",
      orderId: order.orderId
    });

  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create order."
    });
  }
});

// ===============================
// GET ALL ORDERS
// ===============================
app.get("/api/orders", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const orders = await ordersCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const formattedOrders = orders.map(order => {
      let productName = "";
      let quantity = 1;

      if (Array.isArray(order.products) && order.products.length > 0) {
        productName = order.products
          .map(product => product.name || product.productName || "Product")
          .join(", ");

        quantity = order.products.reduce(
          (sum, product) => sum + (Number(product.quantity) || 1),
          0
        );
      }

      return {
        orderId: order.orderId,

        fullName: order.fullName || order.name || "",

        email: order.email || "",

        phone: order.phone || "",

        deliveryAddress:
          order.deliveryAddress || order.address || "",

        productName,

        quantity,

        products: order.products || [],

        total: Number(order.total) || 0,

        currency: order.currency || "NZD",

        status: order.status || "Pending Payment",

        createdAt: order.createdAt,

        updatedAt: order.updatedAt || null
      };
    });

    res.json({
      success: true,
      orders: formattedOrders
    });

  } catch (error) {
    console.error("Get orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load orders."
    });
  }
});

// ===============================
// UPDATE ORDER STATUS
// ===============================
app.put("/api/orders/:orderId/status", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const { orderId } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "Pending Payment",
      "Payment Received",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled"
    ];

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status."
      });
    }

    const result = await ordersCollection.updateOne(
      { orderId },
      {
        $set: {
          status,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    res.json({
      success: true,
      message: "Order status updated successfully.",
      orderId,
      status
    });

  } catch (error) {
    console.error("Update order status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update order status."
    });
  }
});

// ==================================================
// PRODUCTS
// ==================================================

// ===============================
// GET ALL PRODUCTS
// ===============================
app.get("/api/products", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const products = await productsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      products
    });

  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load products."
    });
  }
});

// ===============================
// ADD PRODUCT
// ===============================
app.post("/api/products", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const {
      name,
      category,
      originalPrice,
      offerPrice,
      image,
      stock,
      onOffer
    } = req.body;

    if (!name || !category || offerPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product name, category and offer price are required."
      });
    }

    const original = Number(originalPrice) || Number(offerPrice);
    const offer = Number(offerPrice);

    if (offer <= 0) {
      return res.status(400).json({
        success: false,
        message: "Offer price must be greater than zero."
      });
    }

    const product = {
      productId: "PROD-" + Date.now(),

      name: String(name).trim(),

      category: String(category).trim(),

      originalPrice: original,

      offerPrice: offer,

      image: String(image || "").trim(),

      stock: Math.max(0, Number(stock) || 0),

      onOffer:
        onOffer === true ||
        onOffer === "true",

      currency: "NZD",

      createdAt: new Date(),

      updatedAt: new Date()
    };

    // Calculate discount percentage
    if (product.originalPrice > product.offerPrice) {
      product.discountPercent = Math.round(
        ((product.originalPrice - product.offerPrice) /
          product.originalPrice) *
          100
      );
    } else {
      product.discountPercent = 0;
    }

    const result = await productsCollection.insertOne(product);

    res.json({
      success: true,
      message: "Product added successfully.",
      product: {
        ...product,
        _id: result.insertedId
      }
    });

  } catch (error) {
    console.error("Add product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add product."
    });
  }
});

// ===============================
// UPDATE PRODUCT
// ===============================
app.put("/api/products/:productId", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const { productId } = req.params;

    const {
      name,
      category,
      originalPrice,
      offerPrice,
      image,
      stock,
      onOffer
    } = req.body;

    if (!name || !category || offerPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product name, category and offer price are required."
      });
    }

    const original = Number(originalPrice) || Number(offerPrice);
    const offer = Number(offerPrice);

    if (offer <= 0) {
      return res.status(400).json({
        success: false,
        message: "Offer price must be greater than zero."
      });
    }

    let discountPercent = 0;

    if (original > offer) {
      discountPercent = Math.round(
        ((original - offer) / original) * 100
      );
    }

    const update = {
      name: String(name).trim(),

      category: String(category).trim(),

      originalPrice: original,

      offerPrice: offer,

      image: String(image || "").trim(),

      stock: Math.max(0, Number(stock) || 0),

      onOffer:
        onOffer === true ||
        onOffer === "true",

      currency: "NZD",

      discountPercent,

      updatedAt: new Date()
    };

    const result = await productsCollection.updateOne(
      { productId },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully."
    });

  } catch (error) {
    console.error("Update product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update product."
    });
  }
});

// ===============================
// DELETE PRODUCT
// ===============================
app.delete("/api/products/:productId", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database is not connected."
      });
    }

    const { productId } = req.params;

    const result = await productsCollection.deleteOne({
      productId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully."
    });

  } catch (error) {
    console.error("Delete product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete product."
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
      console.error("MONGODB_URI is not set.");
      process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);

    await client.connect();

    db = client.db(DB_NAME);

    ordersCollection = db.collection("orders");

    productsCollection = db.collection("products");

    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(`Temuoffer server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  }
}

startServer();

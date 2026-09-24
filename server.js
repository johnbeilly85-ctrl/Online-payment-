const express = require("express");
const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "Temuoffer";

// ======================================
// DIRECTORIES
// ======================================

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ======================================
// MULTER IMAGE UPLOAD SETTINGS
// ======================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();

    const safeName =
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 10) +
      extension;

    cb(null, safeName);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, JPEG, PNG, WEBP and GIF images are allowed."
        )
      );
    }
  }
});

// ======================================
// DATABASE
// ======================================

let db;
let ordersCollection;
let productsCollection;

// ======================================
// MIDDLEWARE
// ======================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Website files
app.use(express.static(__dirname));

// Uploaded product images
app.use("/uploads", express.static(uploadsDir));

// ======================================
// HOME PAGE
// ======================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ======================================
// MONGODB CONNECTION
// ======================================

async function connectDatabase() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is missing from Render Environment Variables.");
    return;
  }

  try {
    const client = new MongoClient(MONGODB_URI);

    await client.connect();

    db = client.db(DB_NAME);

    ordersCollection = db.collection("orders");
    productsCollection = db.collection("products");

    console.log("MongoDB connected successfully.");
    console.log("Database:", DB_NAME);

  } catch (error) {
    console.error("MongoDB Connection Error:");
    console.error(error.message);
  }
}

// ======================================
// HEALTH CHECK
// ======================================

app.get("/api/health", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    await db.command({ ping: 1 });

    res.json({
      success: true,
      message: "Temuoffer server and MongoDB are working.",
      database: DB_NAME
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ======================================
// UPLOAD IMAGE FROM GALLERY
// ======================================

app.post("/api/upload-image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image was uploaded."
      });
    }

    const imageUrl =
      "/uploads/" + req.file.filename;

    res.json({
      success: true,
      message: "Image uploaded successfully.",
      image: imageUrl,
      imageUrl: imageUrl,
      filename: req.file.filename
    });

  } catch (error) {
    console.error("Image upload error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Image upload failed."
    });
  }
});

// ======================================
// GET ALL PRODUCTS
// ======================================

app.get("/api/products", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const products = await productsCollection
      .find({})
      .sort({ _id: -1 })
      .toArray();

    res.json({
      success: true,
      products: products
    });

  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load products."
    });
  }
});

// ======================================
// GET SINGLE PRODUCT
// ======================================

app.get("/api/products/:id", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    let product;

    try {
      product = await productsCollection.findOne({
        _id: new ObjectId(req.params.id)
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID."
      });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    res.json({
      success: true,
      product: product
    });

  } catch (error) {
    console.error("Get product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load product."
    });
  }
});

// ======================================
// CREATE PRODUCT
// ======================================

app.post("/api/products", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const product = {
      name: req.body.name || "",
      category: req.body.category || "",

      originalPrice:
        Number(req.body.originalPrice) || 0,

      offerPrice:
        Number(req.body.offerPrice) || 0,

      image:
        req.body.image || "",

      stock:
        Number(req.body.stock) || 0,

      onOffer:
        req.body.onOffer !== false,

      description:
        req.body.description || "",

      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (!product.name) {
      return res.status(400).json({
        success: false,
        message: "Product name is required."
      });
    }

    const result =
      await productsCollection.insertOne(product);

    res.json({
      success: true,
      message: "Product added successfully.",
      productId: result.insertedId,
      product: product
    });

  } catch (error) {
    console.error("Create product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create product."
    });
  }
});

// ======================================
// IMPORT PRODUCTS
// ======================================

app.post("/api/products/import", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const products =
      req.body.products || req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "Products must be supplied as an array."
      });
    }

    if (products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products were supplied."
      });
    }

    const cleanedProducts = products.map(product => ({
      name: product.name || "",
      category: product.category || "",

      originalPrice:
        Number(product.originalPrice) || 0,

      offerPrice:
        Number(product.offerPrice) || 0,

      image:
        product.image || "",

      stock:
        Number(product.stock) || 0,

      onOffer:
        product.onOffer !== false,

      description:
        product.description || "",

      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result =
      await productsCollection.insertMany(
        cleanedProducts
      );

    res.json({
      success: true,
      message:
        `${result.insertedCount} products imported successfully.`,
      insertedCount:
        result.insertedCount
    });

  } catch (error) {
    console.error("Import products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to import products."
    });
  }
});

// ======================================
// UPDATE PRODUCT
// ======================================

app.put("/api/products/:id", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    let productId;

    try {
      productId = new ObjectId(req.params.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID."
      });
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (req.body.name !== undefined) {
      updateData.name = req.body.name;
    }

    if (req.body.category !== undefined) {
      updateData.category = req.body.category;
    }

    if (req.body.originalPrice !== undefined) {
      updateData.originalPrice =
        Number(req.body.originalPrice) || 0;
    }

    if (req.body.offerPrice !== undefined) {
      updateData.offerPrice =
        Number(req.body.offerPrice) || 0;
    }

    if (req.body.image !== undefined) {
      updateData.image = req.body.image;
    }

    if (req.body.stock !== undefined) {
      updateData.stock =
        Number(req.body.stock) || 0;
    }

    if (req.body.onOffer !== undefined) {
      updateData.onOffer =
        req.body.onOffer;
    }

    if (req.body.description !== undefined) {
      updateData.description =
        req.body.description;
    }

    const result =
      await productsCollection.updateOne(
        { _id: productId },
        { $set: updateData }
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

// ======================================
// DELETE PRODUCT
// ======================================

app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    let productId;

    try {
      productId =
        new ObjectId(req.params.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID."
      });
    }

    const result =
      await productsCollection.deleteOne({
        _id: productId
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

// ======================================
// CREATE ORDER
// ======================================

app.post("/api/orders", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const {
      customerName,
      phone,
      email,
      address,
      productId,
      productName,
      quantity,
      amount,
      paymentMethod
    } = req.body;

    if (
      !customerName ||
      !phone ||
      !productName
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Customer name, phone number and product are required."
      });
    }

    const order = {
      customerName:
        customerName.trim(),

      phone:
        phone.trim(),

      email:
        email || "",

      address:
        address || "",

      productId:
        productId || "",

      productName:
        productName.trim(),

      quantity:
        Number(quantity) || 1,

      amount:
        Number(amount) || 0,

      paymentMethod:
        paymentMethod || "",

      status:
        "Pending",

      createdAt:
        new Date(),

      updatedAt:
        new Date()
    };

    const result =
      await ordersCollection.insertOne(order);

    res.json({
      success: true,
      message:
        "Order received successfully.",

      orderId:
        result.insertedId
    });

  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to submit order."
    });
  }
});

// ======================================
// GET ORDERS
// ======================================

app.get("/api/orders", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const orders =
      await ordersCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    res.json({
      success: true,
      orders: orders
    });

  } catch (error) {
    console.error("Get orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load orders."
    });
  }
});

// ======================================
// UPDATE ORDER STATUS
// ======================================

app.patch("/api/orders/:id", async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    let orderId;

    try {
      orderId =
        new ObjectId(req.params.id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID."
      });
    }

    const status =
      req.body.status;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Order status is required."
      });
    }

    const result =
      await ordersCollection.updateOne(
        { _id: orderId },
        {
          $set: {
            status: status,
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
      message:
        "Order status updated successfully."
    });

  } catch (error) {
    console.error("Update order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update order."
    });
  }
});

// ======================================
// API 404
// ======================================

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

// ======================================
// GENERAL ERROR HANDLER
// ======================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        "Image upload error: " +
        error.message
    });
  }

  res.status(500).json({
    success: false,
    message:
      error.message ||
      "Internal server error."
  });
});

// ======================================
// START SERVER
// ======================================

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(
      `Temuoffer server running on port ${PORT}`
    );
  });
}

startServer();

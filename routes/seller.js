const express = require("express");
const sellerRouter = express.Router();
const seller = require("../middlewares/seller");
const { Product } = require("../models/product");
const Order = require("../models/order");
const mongoose = require("mongoose");

// Add Product
sellerRouter.post("/add-product", seller, async (req, res) => {
    try {
        const { name, description, images, quantity, price, category, sellerId } = req.body;
        let product = new Product({
            name,
            description,
            images,
            quantity,
            price,
            category,
            sellerId,
        });
        product = await product.save();
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Product
sellerRouter.post("/update-product", seller, async (req, res) => {
    try {
        const { id, name, description, images, quantity, price, category } = req.body;
        let product = await Product.findByIdAndUpdate(
            id,
            { name, description, images, quantity, price, category },
            { new: true }
        );
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Set Product Discount
sellerRouter.post("/set-discount", seller, async (req, res) => {
    try {
        const { id, percentage, startDate, endDate } = req.body;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }

        product.discount = {
            percentage,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
        };

        // The finalPrice will be calculated by a pre-save hook in the Product model
        await product.save();

        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get product performances for seller
sellerRouter.get("/product-performances", seller, async (req, res) => {
    try {
        const sellerId = req.user;

        // Get all products for this seller first
        const products = await Product.find({ sellerId });

        // Aggregate performance data from orders
        const performanceData = await Order.aggregate([
            // 1. Match delivered orders (not cancelled) containing seller's products
            {
                $match: {
                    status: 3, // Delivered
                    cancelled: { $ne: true },
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            // 2. Unwind products array
            { $unwind: "$products" },
            // 3. Filter for seller's products only
            {
                $match: {
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            // 4. Group by product to calculate metrics
            {
                $group: {
                    _id: "$products.product._id",
                    productName: { $first: "$products.product.name" },
                    imageUrl: { $first: { $arrayElemAt: ["$products.product.images", 0] } },
                    category: { $first: "$products.product.category" },
                    price: { $first: "$products.product.finalPrice" },
                    totalSales: { $sum: "$products.quantity" },
                    totalRevenue: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.finalPrice"]
                        }
                    },
                    totalRatings: { $sum: 1 }, // Count of orders (simplified)
                    avgRating: { $avg: "$products.rating" },
                    lastSold: { $max: "$orderedAt" },
                    orderIds: { $addToSet: "$_id" } // For conversion rate calculation
                }
            },
            // 5. Project final fields
            {
                $project: {
                    _id: 0,
                    productId: "$_id",
                    productName: 1,
                    imageUrl: 1,
                    category: 1,
                    price: 1,
                    totalSales: 1,
                    totalRevenue: 1,
                    totalRatings: 1,
                    avgRating: { $ifNull: ["$avgRating", 0] },
                    lastSold: 1,
                    totalOrders: { $size: "$orderIds" }
                }
            }
        ]);

        // Create performance objects for all products, including those with no sales
        const productPerformances = products.map(product => {
            const perfData = performanceData.find(p =>
                p.productId.toString() === product._id.toString()
            );

            return {
                productId: product._id.toString(),
                productName: product.name,
                imageUrl: product.images.length > 0 ? product.images[0] : '',
                totalViews: 0, // Not tracked yet
                totalSales: perfData ? perfData.totalSales : 0,
                totalRevenue: perfData ? perfData.totalRevenue : 0,
                avgRating: perfData ? perfData.avgRating : (product.avgRating || 0),
                totalRatings: perfData ? perfData.totalRatings : (product.ratings ? product.ratings.length : 0),
                currentStock: product.quantity,
                conversionRate: 0, // Would need view tracking to calculate
                lastSold: perfData ? perfData.lastSold : null,
                category: product.category,
                price: product.finalPrice || product.price
            };
        });

        res.json(productPerformances);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get dashboard overview data for a seller
sellerRouter.get("/dashboard-overview", seller, async (req, res) => {
    try {
        const sellerId = req.user;

        // Concurrently fetch all required data
        const [
            totalProducts,
            totalOrders,
            revenueData,
            customerData
        ] = await Promise.all([
            Product.countDocuments({ sellerId }),
            Order.countDocuments({ "products.product.sellerId": new mongoose.Types.ObjectId(sellerId) }),
            Order.aggregate([
                { $match: { "products.product.sellerId": new mongoose.Types.ObjectId(sellerId), status: 3 } },
                { $unwind: "$products" },
                { $match: { "products.product.sellerId": new mongoose.Types.ObjectId(sellerId) } },
                { $group: { _id: null, totalRevenue: { $sum: { $multiply: ["$products.quantity", "$products.product.finalPrice"] } } } }
            ]),
            Order.aggregate([
                { $match: { "products.product.sellerId": new mongoose.Types.ObjectId(sellerId) } },
                { $group: { _id: "$userId" } },
                { $count: "totalCustomers" }
            ])
        ]);

        res.json({
            totalProducts: totalProducts || 0,
            totalOrders: totalOrders || 0,
            totalCustomers: customerData.length > 0 ? customerData[0].totalCustomers : 0,
            totalRevenue: revenueData.length > 0 ? revenueData[0].totalRevenue : 0,
            conversionRate: totalOrders > 0 ? (totalOrders / (totalProducts > 0 ? totalProducts : 1)) : 0, // Simplified conversion rate
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = sellerRouter;

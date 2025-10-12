


const express = require("express");
const { Product } = require("../models/product");
const admin = require("../middlewares/admin");
const Order = require("../models/order");
const SellerRequest = require("../models/sellerRequest");
const bcryptjs = require('bcryptjs');
const adminRouter = express.Router();
const User = require("../models/user");
const AboutApp = require("../models/aboutApp");

// DEV ONLY: Create admin user
adminRouter.post('/admin/create-admin', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ msg: 'Email address already exists' });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters' });
        }
        const hashedPassword = await bcryptjs.hash(password, 8);
        let user = new User({
            name,
            email,
            password: hashedPassword,
            type: 'admin',
        });
        user = await user.save();
        res.json({ msg: 'Admin created', user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// admin login route can be added here if needed
// admin login route can be added here if needed
adminRouter.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || user.type !== 'admin') {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        // Generate a token or session here if needed
        res.json({ msg: 'Admin logged in', user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Admin adds a new product
adminRouter.post("/admin/add-product", admin, async (req, res) => {
    try {
        const { name, description, images, quantity, price, category } = req.body;
        let product = new Product({
            name,
            description,
            images,
            quantity,
            price,
            category,
        });
        product = await product.save();
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin gets all products
adminRouter.get("/admin/products", admin, async (req, res) => {
    try {
        const products = await Product.find({}).populate('sellerId', 'shopName shopAvatar phoneNumber');
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin deletes a product
adminRouter.delete("/admin/product/:id", admin, async (req, res) => {
    try {
        const { id } = req.params;
        let product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }
        product = await Product.findByIdAndDelete(id);
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



// Admin gets all pending seller requests
adminRouter.get("/admin/seller-requests", admin, async (req, res) => {
    try {
        const requests = await SellerRequest.find({ status: "pending" })
            .populate("userId", "name email") // Lấy thêm name và email từ user
            .lean();
        res.json(requests);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin approves or rejects seller request
adminRouter.post("/admin/process-seller-request", admin, async (req, res) => {
    try {
        const { requestId, status } = req.body;
        const request = await SellerRequest.findById(requestId);

        if (!request) {
            return res.status(404).json({ msg: "Request not found" });
        }

        request.status = status;
        await request.save();

        if (status === "approved") {
            await User.findByIdAndUpdate(request.userId, {
                type: "seller",
                shopName: request.shopName,
                shopDescription: request.shopDescription,
                address: request.address,
                shopAvatar: request.avatarUrl,
                latitude: request.latitude,
                longitude: request.longitude,
                phoneNumber: request.phoneNumber,
            });
        }

        res.json({ msg: `Seller request ${status}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all sellers
adminRouter.get("/admin/sellers", admin, async (req, res) => {
    try {
        const sellers = await User.find({ type: "seller" });
        res.json(sellers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all users (buyers)
adminRouter.get("/admin/users", admin, async (req, res) => {
    try {
        const users = await User.find({ type: "user" });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Suspend seller account
adminRouter.post("/admin/suspend-seller", admin, async (req, res) => {
    try {
        const { sellerId } = req.body;
        const seller = await User.findById(sellerId);

        if (!seller || seller.type !== "seller") {
            return res.status(404).json({ msg: "Seller not found" });
        }

        seller.status = "suspended";
        await seller.save();
        res.json({ msg: "Seller account suspended successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Activate seller account
adminRouter.post("/admin/activate-seller", admin, async (req, res) => {
    try {
        const { sellerId } = req.body;
        const seller = await User.findById(sellerId);

        if (!seller || seller.type !== "seller") {
            return res.status(404).json({ msg: "Seller not found" });
        }

        seller.status = "active";
        await seller.save();
        res.json({ msg: "Seller account activated successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete seller account
adminRouter.delete("/admin/seller/:id", admin, async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await User.findById(id);

        if (!seller || seller.type !== "seller") {
            return res.status(404).json({ msg: "Seller not found" });
        }

        seller.status = "deleted";
        await seller.save();
        res.json({ msg: "Seller account deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Suspend user account
adminRouter.post("/admin/suspend-user", admin, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);

        if (!user || user.type !== "user") {
            return res.status(404).json({ msg: "User not found" });
        }

        user.status = "suspended";
        await user.save();
        res.json({ msg: "User account suspended successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Approve user account
adminRouter.post("/admin/approve-user", admin, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);

        if (!user || user.type !== "user") {
            return res.status(404).json({ msg: "User not found" });
        }

        user.status = "active";
        await user.save();
        res.json({ msg: "User account approved successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete user account
adminRouter.delete("/admin/user/:id", admin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user || user.type !== "user") {
            return res.status(404).json({ msg: "User not found" });
        }

        user.status = "deleted";
        await user.save();
        res.json({ msg: "User account deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get seller statistics
adminRouter.get("/admin/seller-stats", admin, async (req, res) => {
    try {
        const totalSellers = await User.countDocuments({ type: "seller" });
        const pendingRequests = await SellerRequest.countDocuments({
            status: "pending",
        });

        res.json({
            totalSellers,
            pendingRequests,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get best sellers statistics
adminRouter.get("/admin/best-sellers", admin, async (req, res) => {
    try {
        const { month, year, category } = req.query;

        // Base query để lấy các đơn hàng đã delivered
        let matchQuery = {
            status: 3,
        };

        // Nếu có tháng và năm, thêm filter theo thời gian
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);
            matchQuery.orderedAt = {
                $gte: startDate.getTime(),
                $lte: endDate.getTime(),
            };
        }

        // Thêm điều kiện category nếu có
        const categoryMatch = category
            ? { "products.product.category": category }
            : {};

        const sellers = await Order.aggregate([
            { $match: matchQuery },
            { $unwind: "$products" },
            {
                $lookup: {
                    from: "users",
                    localField: "products.product.sellerId",
                    foreignField: "_id",
                    as: "seller",
                },
            },
            { $unwind: "$seller" },
            { $match: categoryMatch },
            {
                $group: {
                    _id: "$seller._id",
                    shopName: { $first: "$seller.shopName" },
                    shopAvatar: { $first: "$seller.shopAvatar" },
                    totalRevenue: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.price"],
                        },
                    },
                    totalOrders: { $sum: 1 },
                    totalProducts: {
                        $sum: "$products.quantity",
                    },
                },
            },
            { $sort: { totalRevenue: -1 } },
        ]);

        res.json(sellers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all orders for admin
adminRouter.get("/admin/orders", admin, async (req, res) => {
    try {
        const orders = await Order.find({}).populate('products.product').sort({ orderedAt: -1 });
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Change order status by admin
adminRouter.post("/admin/change-order-status", admin, async (req, res) => {
    try {
        const { id, status } = req.body;
        let order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        order.status = status;
        order = await order.save();
        res.json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get about app information
adminRouter.get("/api/about-app", async (req, res) => {
    try {
        let aboutApp = await AboutApp.findOne();
        if (!aboutApp) {
            aboutApp = new AboutApp();
            await aboutApp.save();
        }
        res.json({
            appName: aboutApp.appName,
            version: aboutApp.version,
            description: aboutApp.description,
            developer: aboutApp.developer,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update about app information (admin only)
adminRouter.post("/admin/update-about-app", admin, async (req, res) => {
    try {
        const { appName, version, description, developer } = req.body;
        let aboutApp = await AboutApp.findOne();
        if (!aboutApp) {
            aboutApp = new AboutApp();
        }
        aboutApp.appName = appName || aboutApp.appName;
        aboutApp.version = version || aboutApp.version;
        aboutApp.description = description || aboutApp.description;
        aboutApp.developer = developer || aboutApp.developer;
        await aboutApp.save();
        res.json({ msg: 'About app information updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = adminRouter;

const express = require("express");
const seller = require("../middlewares/seller");
const Order = require("../models/order");
const { Product } = require("../models/product");
const User = require("../models/user");
const mongoose = require("mongoose");

const sellerRouter = express.Router();

// Get seller analytics
sellerRouter.get("/analytics", seller, async (req, res) => {
    try {
        const sellerId = req.user;
        let totalEarnings = 0;

        const sales = await Order.aggregate([
            // 1. Match delivered orders
            {
                $match: {
                    status: 3, // Delivered
                    cancelled: { $ne: true },
                },
            },
            // 2. Unwind the products array
            { $unwind: "$products" },
            // 3. Filter for products belonging to the current seller
            {
                $match: {
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId),
                },
            },
            // 4. Group by product category and sum up the earnings
            {
                $group: {
                    _id: "$products.product.category",
                    earning: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.finalPrice"],
                        },
                    },
                },
            },
            // 5. Project the fields to match the 'Sales' model on the frontend
            {
                $project: {
                    _id: 0,
                    label: "$_id",
                    earning: "$earning",
                },
            },
        ]);

        // Calculate total earnings from the sales data
        if (sales.length > 0) {
            totalEarnings = sales.reduce((sum, item) => sum + item.earning, 0);
        }

        res.json({ categoryData: sales, totalEarnings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add product
sellerRouter.post("/add-product", seller, async (req, res) => {
    try {
        const { name, description, images, quantity, price, category } = req.body;
        let product = new Product({
            name,
            description,
            images,
            quantity,
            price,
            category,
            finalPrice: price, // Set finalPrice to price on creation
            sellerId: req.user,
        });
        product = await product.save();
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get products for seller
sellerRouter.get("/get-products", seller, async (req, res) => {
    try {
        const products = await Product.find({ sellerId: req.user });
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete product
sellerRouter.post("/delete-product", seller, async (req, res) => {
    try {
        const { id } = req.body;
        let product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }
        if (product.sellerId.toString() !== req.user) {
            return res.status(403).json({ msg: "Unauthorized" });
        }
        product = await Product.findByIdAndDelete(id);
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update product
sellerRouter.post("/update-product", seller, async (req, res) => {
    try {
        const { id, name, description, price, quantity, category, images } = req.body;
        let product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }
        if (product.sellerId.toString() !== req.user) {
            return res.status(403).json({ msg: "Unauthorized" });
        }
        product.name = name;
        product.description = description;
        product.price = price;
        product.quantity = quantity;
        product.category = category;
        product.images = images;

        // Recalculate finalPrice if price is updated
        product.finalPrice = price; // Default to base price
        if (product.discount && product.discount.percentage > 0) {
            const now = new Date();
            if (now >= product.discount.startDate && now <= product.discount.endDate) {
                product.finalPrice = product.price * (1 - product.discount.percentage / 100);
            }
        }

        product = await product.save();
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get orders for seller
sellerRouter.get("/get-orders", seller, async (req, res) => {
    try {
        const orders = await Order.find({ "products.product.sellerId": req.user })
            .populate('products.product')
            .populate('userId', 'name email address phoneNumber')
            .sort({ orderedAt: -1 });
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Change order status
sellerRouter.post("/change-order-status", seller, async (req, res) => {
    try {
        const { id, status } = req.body;
        let order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        // Check if the seller has products in this order
        const hasSellerProducts = order.products.some(product =>
            product.product.sellerId.toString() === req.user
        );
        if (!hasSellerProducts) {
            return res.status(403).json({ msg: 'Unauthorized' });
        }
        order.status = status;
        order = await order.save();
        res.json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update payment status
sellerRouter.post("/update-payment-status", seller, async (req, res) => {
    try {
        const { id, paymentStatus } = req.body;
        let order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        // Check if the seller has products in this order
        const hasSellerProducts = order.products.some(product =>
            product.product.sellerId.toString() === req.user
        );
        if (!hasSellerProducts) {
            return res.status(403).json({ msg: 'Unauthorized' });
        }
        order.paymentStatus = paymentStatus;
        order = await order.save();
        res.json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get shop data
sellerRouter.get("/shop-data/:sellerId", seller, async (req, res) => {
    try {
        const { sellerId } = req.params;
        const shopOwner = await User.findById(sellerId);
        if (!shopOwner) {
            return res.status(404).json({ msg: "Shop not found" });
        }
        const products = await Product.find({ sellerId });
        res.json({ shopOwner, products });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get shop owner (for sellers viewing other sellers)
sellerRouter.get("/shop-owner/:sellerId", seller, async (req, res) => {
    try {
        const { sellerId } = req.params;
        const shopOwner = await User.findById(sellerId);
        if (!shopOwner) {
            return res.status(404).json({ msg: "Shop not found" });
        }
        res.json(shopOwner);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get shop stats (for sellers viewing other sellers)
sellerRouter.get("/shop-stats/:sellerId", seller, async (req, res) => {
    try {
        const { sellerId } = req.params;
        const totalProducts = await Product.countDocuments({ sellerId });
        const orders = await Order.find({ "products.product.sellerId": sellerId, status: 3 });
        let totalRating = 0;
        let ratingCount = 0;
        orders.forEach(order => {
            order.products.forEach(product => {
                if (product.product.sellerId.toString() === sellerId && product.rating) {
                    totalRating += product.rating;
                    ratingCount++;
                }
            });
        });
        const avgRating = ratingCount > 0 ? totalRating / ratingCount : 0;
        const followerCount = await User.countDocuments({ following: sellerId });
        res.json({
            totalProducts,
            avgRating,
            followerCount
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Follow seller
sellerRouter.post("/follow", seller, async (req, res) => {
    try {
        const { sellerId } = req.body;
        const user = await User.findById(req.user);
        if (!user.following.includes(sellerId)) {
            user.following.push(sellerId);
            await user.save();
        }
        res.json({ msg: "Followed successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Unfollow seller
sellerRouter.post("/unfollow", seller, async (req, res) => {
    try {
        const { sellerId } = req.body;
        const user = await User.findById(req.user);
        user.following = user.following.filter(id => id.toString() !== sellerId);
        await user.save();
        res.json({ msg: "Unfollowed successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Set discount
sellerRouter.post("/set-discount", seller, async (req, res) => {
    try {
        const { id, percentage, startDate, endDate } = req.body;
        let product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }
        if (product.sellerId.toString() !== req.user) {
            return res.status(403).json({ msg: "Unauthorized" });
        }
        product.discount = {
            percentage,
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };
        product = await product.save();
        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get seller address by sellerId
sellerRouter.get("/address/:sellerId", seller, async (req, res) => {
    try {
        const { sellerId } = req.params;
        const sellerUser = await User.findById(sellerId);
        if (!sellerUser) {
            return res.status(404).json({ msg: "Seller not found" });
        }
        res.json({ address: sellerUser.address || "" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get addresses of all sellers in cart
sellerRouter.get("/addresses/cart", seller, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        // Extract unique seller IDs from cart
        const sellerIds = [...new Set(user.cart.map(item => item.product.sellerId.toString()))];

        // Get addresses for all sellers
        const sellers = await User.find({ _id: { $in: sellerIds } }).select('address');
        const addresses = sellers.map(seller => seller.address || "");

        res.json(addresses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get seller dashboard overview data
sellerRouter.get("/dashboard-overview", seller, async (req, res) => {
    try {
        const sellerId = req.user;

        // Get total products count
        const totalProducts = await Product.countDocuments({ sellerId });

        // Get total orders count (all orders containing seller's products)
        const totalOrders = await Order.countDocuments({
            "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
        });

        // Get unique customers count (users who have ordered from this seller)
        const uniqueCustomers = await Order.distinct("userId", {
            "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
        });
        const totalCustomers = uniqueCustomers.length;

        // Get total revenue (from delivered orders only)
        const revenueResult = await Order.aggregate([
            {
                $match: {
                    status: 3, // Delivered
                    cancelled: { $ne: true },
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            { $unwind: "$products" },
            {
                $match: {
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.finalPrice"]
                        }
                    }
                }
            }
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // Calculate conversion rate (orders / unique customers, if customers > 0)
        const conversionRate = totalCustomers > 0 ? (totalOrders / totalCustomers) : 0;

        res.json({
            totalProducts,
            totalOrders,
            totalCustomers,
            totalRevenue,
            conversionRate
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get enhanced analytics data with time period filtering
sellerRouter.get("/enhanced-analytics", seller, async (req, res) => {
    try {
        const sellerId = req.user;
        const { period = 'monthly', startDate, endDate } = req.query;

        // Calculate date range based on period
        let start, end;
        const now = new Date();

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else {
            switch (period) {
                case 'daily':
                    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                    break;
                case 'weekly':
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
                    end = new Date(start);
                    end.setDate(start.getDate() + 7);
                    break;
                case 'monthly':
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    break;
                case 'yearly':
                    start = new Date(now.getFullYear(), 0, 1);
                    end = new Date(now.getFullYear() + 1, 0, 1);
                    break;
                default:
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            }
        }

        // Get category-wise earnings for the period
        const categorySales = await Order.aggregate([
            {
                $match: {
                    status: 3, // Delivered
                    cancelled: { $ne: true },
                    orderedAt: { $gte: start, $lt: end },
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            { $unwind: "$products" },
            {
                $match: {
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            {
                $group: {
                    _id: "$products.product.category",
                    earning: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.finalPrice"]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    label: "$_id",
                    earning: "$earning"
                }
            }
        ]);

        // Get total earnings for the period
        const totalEarningsResult = await Order.aggregate([
            {
                $match: {
                    status: 3,
                    cancelled: { $ne: true },
                    orderedAt: { $gte: start, $lt: end },
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            { $unwind: "$products" },
            {
                $match: {
                    "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalEarnings: {
                        $sum: {
                            $multiply: ["$products.quantity", "$products.product.finalPrice"]
                        }
                    },
                    totalOrders: { $addToSet: "$_id" }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalEarnings: 1,
                    orderCount: { $size: "$totalOrders" }
                }
            }
        ]);

        const totalEarnings = totalEarningsResult.length > 0 ? totalEarningsResult[0].totalEarnings : 0;
        const totalOrders = totalEarningsResult.length > 0 ? totalEarningsResult[0].orderCount : 0;

        // Get unique customers for the period
        const uniqueCustomers = await Order.distinct("userId", {
            status: 3,
            cancelled: { $ne: true },
            orderedAt: { $gte: start, $lt: end },
            "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
        });

        const totalCustomers = uniqueCustomers.length;
        const averageOrderValue = totalOrders > 0 ? totalEarnings / totalOrders : 0;
        const conversionRate = totalCustomers > 0 ? (totalOrders / totalCustomers) : 0;

        // Generate trend data based on period
        let dailyEarnings = [];
        let weeklyEarnings = [];
        let monthlyEarnings = [];

        if (period === 'monthly') {
            // Daily earnings for the month
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dayStart = new Date(now.getFullYear(), now.getMonth(), day);
                const dayEnd = new Date(now.getFullYear(), now.getMonth(), day + 1);

                const dayResult = await Order.aggregate([
                    {
                        $match: {
                            status: 3,
                            cancelled: { $ne: true },
                            orderedAt: { $gte: dayStart, $lt: dayEnd },
                            "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                        }
                    },
                    { $unwind: "$products" },
                    {
                        $match: {
                            "products.product.sellerId": new mongoose.Types.ObjectId(sellerId)
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            earnings: {
                                $sum: {
                                    $multiply: ["$products.quantity", "$products.product.finalPrice"]
                                }
                            }
                        }
                    }
                ]);

                dailyEarnings.push(dayResult.length > 0 ? dayResult[0].earnings : 0);
            }
        }

        res.json({
            totalEarnings,
            categorySales,
            averageOrderValue,
            totalOrders,
            totalCustomers,
            conversionRate,
            dailyEarnings,
            weeklyEarnings,
            monthlyEarnings,
            periodStart: start,
            periodEnd: end
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = sellerRouter;

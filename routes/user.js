const express = require('express');
const userRouter = express.Router();
const auth = require("../middlewares/auth");
const { Product } = require('../models/product');
const User = require('../models/user');
const Order = require("../models/order");
const Notification = require('../models/notification');


// Add product to cart
userRouter.post("/api/add-to-cart", auth, async (req, res) => {
    try {
        const { id } = req.body;
        const product = await Product.findById(id);
        let user = await User.findById(req.user);
        const existingProduct = user.cart.find((item) => item.product._id.equals(product._id));
        if (existingProduct) {
            existingProduct.quantity++;
        }
        else {
            user.cart.push({ product, quantity: 1 });
        }
        user = await user.save();
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Delete product from cart
userRouter.delete("/api/remove-from-cart/:id", auth, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findById(id);
        let user = await User.findById(req.user);

        // Find and update the product in cart
        const cartItemIndex = user.cart.findIndex(
            (item) => item.product._id.equals(product._id)
        );

        if (cartItemIndex !== -1) {
            user.cart[cartItemIndex].quantity--;

            // Remove item if quantity reaches 0
            if (user.cart[cartItemIndex].quantity <= 0) {
                user.cart.splice(cartItemIndex, 1);
            }
        }

        user = await user.save();
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// save user address
userRouter.post("/api/save-user-address", auth, async (req, res) => {
    try {
        const { address } = req.body;
        let user = await User.findById(req.user);
        user.address = address;
        user = await user.save();
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// get all your orders
userRouter.get("/api/orders/me", auth, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user })
            .populate({
                path: 'products.product',
                populate: {
                    path: 'sellerId',
                    select: 'name email shopName'
                }
            });
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// get all your notifications
userRouter.get("/api/notifications", auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user }).sort({ createdAt: -1 });
        res.json(notifications);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// mark all notifications as read
userRouter.post("/api/notifications/mark-read", auth, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user, read: false },
            { $set: { read: true } }
        );
        res.json({ msg: 'All notifications marked as read' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// delete a notification
userRouter.delete("/api/notifications/:id", auth, async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: req.user
        });
        if (!notification) {
            return res.status(404).json({ msg: 'Notification not found' });
        }
        res.json({ msg: 'Notification deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// delete all notifications
userRouter.delete("/api/notifications-all", auth, async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user });
        res.json({ msg: 'All notifications deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// clear old notifications
userRouter.delete("/api/notifications-old", auth, async (req, res) => {
    try {
        const { days } = req.query;
        const daysOld = parseInt(days) || 30;
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - daysOld);

        const result = await Notification.deleteMany({
            userId: req.user,
            createdAt: { $lt: dateThreshold }
        });

        res.json({ msg: `Notifications older than ${daysOld} days deleted` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get product by ID
userRouter.get("/api/product/:id", auth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }

        res.json(product);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cancel order (for buyers)
userRouter.post("/api/orders/cancel/:id", auth, async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            userId: req.user
        });

        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }

        if (order.status >= 1) {
            return res.status(400).json({ msg: "Cannot cancel order that has been shipped" });
        }

        if (order.cancelled) {
            return res.status(400).json({ msg: "Order is already cancelled" });
        }

        // Restore product quantities
        for (let i = 0; i < order.products.length; i++) {
            if (order.products[i].product) {
                const product = await Product.findById(order.products[i].product._id);
                if (product) {
                    product.quantity += order.products[i].quantity;
                    await product.save();
                }
            }
        }

        order.cancelled = true;
        await order.save();

        res.json({ msg: "Order cancelled successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete order (for buyers)
userRouter.delete("/api/orders/:id", auth, async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            userId: req.user
        });

        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }

        if (!order.cancelled) {
            return res.status(400).json({ msg: "Can only delete cancelled orders" });
        }

        await Order.findByIdAndDelete(req.params.id);
        res.json({ msg: "Order deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

userRouter.post("/api/update-profile", auth, async (req, res) => {
    try {
        const { name, email, phoneNumber, address, shopName, shopDescription, shopAvatar } = req.body;
        let user = await User.findById(req.user);

        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
        if (address !== undefined) user.address = address;
        if (shopName !== undefined) user.shopName = shopName;
        if (shopDescription !== undefined) user.shopDescription = shopDescription;
        if (shopAvatar !== undefined) user.shopAvatar = shopAvatar;

        await user.save();

        res.json({ msg: "Profile updated successfully", user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get top sellers by revenue
userRouter.get("/api/best-sellers", auth, async (req, res) => {
    try {
        const sellers = await Order.aggregate([
            { $match: { status: 3 } },
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
            {
                $group: {
                    _id: "$seller._id",
                    name: { $first: "$seller.name" },
                    email: { $first: "$seller.email" },
                    shopName: { $first: "$seller.shopName" },
                    shopDescription: { $first: "$seller.shopDescription" },
                    shopAvatar: { $first: "$seller.shopAvatar" },
                    address: { $first: "$seller.address" },
                    latitude: { $first: "$seller.latitude" },
                    longitude: { $first: "$seller.longitude" },
                    type: { $first: "$seller.type" },
                    status: { $first: "$seller.status" },
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
            { $limit: 10 },
        ]);

        res.json(sellers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = userRouter;

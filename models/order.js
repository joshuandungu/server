const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    products: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true,
            },
            quantity: {
                type: Number,
                required: true,
            },
        },
    ],
    totalPrice: {
        type: Number,
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    userId: {
        type: String,
        required: true,
    },
    orderedAt: {
        type: Number,
        required: true,
    },
    status: {
        type: Number,
        default: 0,
    },
    cancelled: {
        type: Boolean,
        default: false,
    },
    paymentMethod: {
        type: String,
        default: 'COD',
    },
    paymentStatus: {
        type: String,
        default: 'pending',
    },
    phoneNumber: {
        type: String,
        required: true,
    },
    paymentDetails: {
        type: Object,
        default: {},
    },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
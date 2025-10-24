const mongoose = require("mongoose");
const { productSchema } = require("./product");

const userSchema = mongoose.Schema({
    name: {
        required: true,
        type: String,
        trim: true,
    },
    email: {
        required: true,
        type: String,
        trim: true,
        validate: {
            validator: (value) => {
                const re =
                    /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
                return value.match(re);
            },
            message: "Please enter a valid email address",
        },
    },
    password: {
        required: true,
        type: String,
        
    },
    isEmailVerified: {
        type: Boolean,
        default: true,
    },
    emailVerificationCode: {
        type: String,
        default: null,
    },
    address: {
        type: String,
        default: "",
    },
    type: {
        type: String,
        enum: ['user', 'seller', 'admin'],
        default: "user",
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'suspended', 'deleted'],
        default: "active",
    },
    shopName: {
        type: String,
        default: "",
    },
    shopDescription: {
        type: String,
        default: "",
    },
    shopAvatar: {
        type: String,
        default: "",
    },
    // cart
    cart: [
        {
            _id: false, // Prevent Mongoose from creating an _id for subdocuments
            product: productSchema,
            quantity: {
                type: Number,
                required: true,
            }
        },
    ],
    // Add a default value to ensure cart is always an array
    default: [],

    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    phoneNumber: {
        type: String,
        default: ''
    },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
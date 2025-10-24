const mongoose = require('mongoose');

const aboutAppSchema = new mongoose.Schema({
    appName: {
        type: String,
        default: 'Revos E-commerce App',
    },
    version: {
        type: String,
        default: '1.0.0',
    },
    description: {
        type: String,
        default: 'This app allows you to shop from various sellers, manage your orders, and more.',
    },
    developer: {
        type: String,
        default: 'Your Company',
    },
    contactEmail: {
        type: String,
        default: 'support@revosapp.com',
    },
    contactPhone: {
        type: String,
        default: '+1234567890',
    },
    supportEmail: {
        type: String,
        default: 'help@revosapp.com',
    },
    address: {
        type: String,
        default: '123 Business Street, City, Country',
    },
}, { timestamps: true });

module.exports = mongoose.model('AboutApp', aboutAppSchema);

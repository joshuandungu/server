const nodemailer = require("nodemailer"); // This is not needed here, it's in email.js
const config = require("../config/config");

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: config.GMAIL_USER,
        pass: config.GMAIL_PASS,
    },
});

// Email template for buyer order confirmation
const buyerOrderTemplate = (orderData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .order-details { background-color: #f9f9f9; padding: 15px; margin: 10px 0; }
        .product-item { border-bottom: 1px solid #eee; padding: 10px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for your order!</p>
        </div>

        <div class="content">
            <h2>Order Details</h2>
            <div class="order-details">
                <p><strong>Order ID:</strong> ${orderData.orderId}</p>
                <p><strong>Order Date:</strong> ${new Date(orderData.date).toLocaleDateString()}</p>
                <p><strong>Order Status:</strong> ${orderData.orderStatus}</p>
                <p><strong>Payment Status:</strong> ${orderData.paymentStatus}</p>
                <p><strong>Payment Method:</strong> ${orderData.paymentMethod}</p>
                <p><strong>Total Amount:</strong> $${orderData.totalPrice}</p>
            </div>

            <h2>Delivery Information</h2>
            <div class="order-details">
                <p><strong>Delivery Address:</strong></p>
                <p>${orderData.deliveryAddress}</p>
                <p><strong>Phone Number:</strong> ${orderData.phoneNumber}</p>
            </div>

            <h2>Products Ordered</h2>
            ${orderData.products.map(product => `
                <div class="product-item">
                    <h3>${product.name}</h3>
                    <p><strong>Vendor:</strong> ${product.vendorName}</p>
                    <p><strong>Vendor Email:</strong> ${product.vendorEmail}</p>
                    <p><strong>Quantity:</strong> ${product.quantity}</p>
                    <p><strong>Price:</strong> $${product.price}</p>
                    <p><strong>Subtotal:</strong> $${(product.price * product.quantity).toFixed(2)}</p>
                </div>
            `).join('')}

            <div class="order-details">
                <p><strong>Total Amount: $${orderData.totalPrice}</strong></p>
            </div>
        </div>

        <div class="footer">
            <p>If you have any questions about your order, please contact our support team.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;

// Email template for seller order notification
const sellerOrderTemplate = (orderData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>New Order Received</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .order-details { background-color: #f9f9f9; padding: 15px; margin: 10px 0; }
        .product-item { border-bottom: 1px solid #eee; padding: 10px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Order Received!</h1>
            <p>You have a new order to fulfill</p>
        </div>

        <div class="content">
            <h2>Order Details</h2>
            <div class="order-details">
                <p><strong>Order ID:</strong> ${orderData.orderId}</p>
                <p><strong>Order Date:</strong> ${new Date(orderData.date).toLocaleDateString()}</p>
                <p><strong>Order Status:</strong> ${orderData.orderStatus}</p>
                <p><strong>Payment Status:</strong> ${orderData.paymentStatus}</p>
                <p><strong>Payment Method:</strong> ${orderData.paymentMethod}</p>
                <p><strong>Total Amount:</strong> $${orderData.totalPrice}</p>
            </div>

            <h2>Customer Information</h2>
            <div class="order-details">
                <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
                <p><strong>Customer Email:</strong> ${orderData.customerEmail}</p>
                <p><strong>Phone Number:</strong> ${orderData.phoneNumber}</p>
            </div>

            <h2>Delivery Information</h2>
            <div class="order-details">
                <p><strong>Delivery Address:</strong></p>
                <p>${orderData.deliveryAddress}</p>
            </div>

            <h2>Products Ordered</h2>
            ${orderData.products.map(product => `
                <div class="product-item">
                    <h3>${product.name}</h3>
                    <p><strong>Quantity:</strong> ${product.quantity}</p>
                    <p><strong>Price:</strong> $${product.price}</p>
                    <p><strong>Subtotal:</strong> $${(product.price * product.quantity).toFixed(2)}</p>
                </div>
            `).join('')}

            <div class="order-details">
                <p><strong>Total Amount: $${orderData.totalPrice}</strong></p>
            </div>

            <h2>Next Steps</h2>
            <div class="order-details">
                <p>1. Review the order details above</p>
                <p>2. Prepare the products for shipping</p>
                <p>3. Update order status when shipped</p>
                <p>4. Contact customer if you have any questions</p>
            </div>
        </div>

        <div class="footer">
            <p>Please process this order promptly to maintain good customer service.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;

// Email template for password reset
const passwordResetTemplate = (resetUrl, userName) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Password Reset Request</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .header { background-color: #007bff; color: white; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
        </div>
        <div class="content">
            <p>Hello ${userName || 'User'},</p>
            <p>We received a request to reset your password. Click the button below to choose a new one. This link will expire in 10 minutes.</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Your Password</a>
            </p>
            <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
            <p>If you're having trouble with the button, copy and paste this URL into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
        </div>
        <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`;

// Send buyer order confirmation email
async function sendBuyerOrderEmail(buyerEmail, orderData) {
    const mailOptions = {
        from: config.GMAIL_USER,
        to: buyerEmail,
        subject: `Order Confirmation - Order #${orderData.orderId}`,
        html: buyerOrderTemplate(orderData),
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Buyer order confirmation email sent to ${buyerEmail}`);
    } catch (error) {
        console.error("Error sending buyer order email:", error);
        throw error;
    }
}

// Send seller order notification email
async function sendSellerOrderEmail(sellerEmail, orderData) {
    const mailOptions = {
        from: config.GMAIL_USER,
        to: sellerEmail,
        subject: `New Order Received - Order #${orderData.orderId}`,
        html: sellerOrderTemplate(orderData),
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Seller order notification email sent to ${sellerEmail}`);
    } catch (error) {
        console.error("Error sending seller order email:", error);
        throw error;
    }
}

// Helper function to get seller information from sellerId
async function getSellerInfo(sellerId) {
    try {
        const User = require('../models/user');
        const seller = await User.findById(sellerId);
        if (seller) {
            return {
                sellerName: seller.name,
                sellerEmail: seller.email
            };
        }
        return {
            sellerName: 'Unknown Seller',
            sellerEmail: 'seller@example.com'
        };
    } catch (error) {
        console.error('Error fetching seller info:', error);
        return {
            sellerName: 'Unknown Seller',
            sellerEmail: 'seller@example.com'
        };
    }
}

module.exports = {
    sendBuyerOrderEmail,
    sendSellerOrderEmail,
    passwordResetTemplate
};

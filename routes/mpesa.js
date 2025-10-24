require('dotenv').config();

const express = require('express');
const axios = require('axios');
const auth = require('../middlewares/auth');
const Order = require('../models/order');

const mpesaRouter = express.Router();

// --- M-PESA CONFIGURATION ---
// Prefer environment variables for all secrets and endpoints. These fallbacks are ONLY for local sandbox testing.
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "XT7jbFbpUeG0EzBJoT4yHCd70gnivoeqCAf2Ao4dI7aCJQUW";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "hfuESnzGCAYJJIgjL6JYeUhNt2UASl4S32soGhT2fk2LhmvEt0bGga6QmxACtZXu";
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "174379"; // Paybill/Till
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const MPESA_ENV = process.env.MPESA_ENV || "sandbox";

const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "https://gas-app-backend-1gjx.onrender.com/api/mpesa/callback";
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET || "superSecretToken"; // extra layer of security - override in production

// Safaricom URLs
const mpesaAuthUrl = MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

const mpesaStkUrl = MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
    : "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

const mpesaTransactionStatusUrl = MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query"
    : "https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query";

const mpesaEncryptUrl = MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke/cert/v1/encrypt"
    : "https://api.safaricom.co.ke/cert/v1/encrypt";

// Helper: Get Access Token
const getAccessToken = async () => {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const response = await axios.get(mpesaAuthUrl, {
        headers: { Authorization: `Basic ${auth}` },
    });
    if (!response || !response.data || !response.data.access_token) {
        throw new Error('Failed to obtain M-Pesa access token');
    }
    return response.data.access_token;
};

// Helper: Generate Security Credential for Transaction Status Query
const getSecurityCredential = async () => {
    // This should be the plain text password from your Daraja portal
    const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD;
    if (!initiatorPassword) {
        console.error("MPESA_INITIATOR_PASSWORD environment variable not set.");
        // In a real app, you might return a pre-encrypted credential for testing
        // or throw an error. For this example, we'll use a placeholder.
        return "yourEncryptedCredential";
    }

    const response = await axios.post(mpesaEncryptUrl, {
        "initiatorIdentifier": initiatorPassword,
        "securityCredential": "Safaricom" // This is a fixed value
    }, {
        headers: { Authorization: `Bearer ${await getAccessToken()}` }
    });

    return response.data.encryptedSecurityCredential;
};

// 🟢 1. Initiate STK Push
mpesaRouter.post("/api/mpesa/stk-push", auth, async (req, res) => {
    const { amount, phoneNumber, orderId } = req.body;

    if (!amount || !phoneNumber || !orderId) {
        return res.status(400).json({ msg: "Amount, phone number, and orderId are required." });
    }

    if (amount < 1) {
        return res.status(400).json({ msg: "Amount cannot be less than 1 " });
    }

    // More flexible regex for KE phone numbers
    const phoneRegex = /^(\+254|254|0)([17]\d{8}|[2-9]\d{8})$/;
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ msg: "Invalid phone number format." });
    }

    const formattedPhone = phoneNumber.startsWith("0")
        ? `254${phoneNumber.substring(1)}`
        : phoneNumber.startsWith("+254")
            ? phoneNumber.substring(1)
            : phoneNumber;

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    try {
        const accessToken = await getAccessToken();

        // Check if order exists before updating
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }

        const stkPayload = {
            BusinessShortCode: MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.round(amount),
            PartyA: formattedPhone,
            PartyB: MPESA_SHORTCODE,
            PhoneNumber: formattedPhone,
            CallBackURL: `${MPESA_CALLBACK_URL}/${orderId}?secret=${CALLBACK_SECRET}`,
            AccountReference: "EcommerceApp",
            TransactionDesc: `Payment for Order ${orderId}`,
        };

        const response = await axios.post(mpesaStkUrl, stkPayload, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30000
        });

        // Ensure response data exists before accessing properties
        if (!response || !response.data) {
            throw new Error("Invalid response from M-Pesa API");
        }

        // Daraja returns CheckoutRequestID in various cases; normalize keys
        const checkoutRequestId = response.data.CheckoutRequestID || response.data.checkoutRequestID || null;

        await Order.findByIdAndUpdate(orderId, {
            paymentStatus: "initiated",
            $set: {
                'paymentDetails.method': "M-Pesa",
                'paymentDetails.initiatedAt': new Date(),
                'paymentDetails.amount': amount,
                'paymentDetails.checkoutRequestId': checkoutRequestId,
                'paymentDetails.responseCode': response.data.ResponseCode || response.data.responseCode || null,
                'paymentDetails.rawResponse': response.data
            },
            $unset: { // Clear previous error fields if any
                'paymentDetails.error': ""
            }
        });

        res.json({
            ...(response.data || {}),
            message: "STK push initiated successfully"
        });

    } catch (error) {
        // Ensure order exists before updating status
        try {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: "failed", // Mark as failed
                $set: {
                    'paymentDetails.method': "M-Pesa",
                    'paymentDetails.error': error.message,
                    'paymentDetails.failedAt': new Date()
                },
            });
        } catch (dbError) {
            console.error("Failed to update order status:", dbError);
        }

        if (error.response) {
            res.status(error.response.status).json({
                error: "M-Pesa API Error",
                details: error.response.data || "Unknown error"
            });
        } else if (error.code === 'ECONNABORTED') {
            res.status(408).json({ error: "Request timeout. Please try again." });
        } else {
            res.status(500).json({ error: "Failed to initiate M-Pesa payment.", details: error.message });
        }
    }
});

// 🟢 2. Callback Endpoint
mpesaRouter.post("/api/mpesa/callback/:orderId", async (req, res) => {
    const { orderId } = req.params;

    // Security check
    if (req.query.secret !== CALLBACK_SECRET) {
        return res.status(403).json({ msg: "Forbidden: Invalid callback secret." });
    }

    // Log callback for debugging (consider using a logger in production)
    console.log('M-Pesa callback received:', JSON.stringify(req.body));

    // Validate body structure
    const callbackData = req.body && req.body.Body && req.body.Body.stkCallback ? req.body.Body.stkCallback : null;
    if (!callbackData) {
        console.warn('Invalid callback payload shape');
        return res.status(400).json({ msg: 'Invalid callback payload' });
    }

    try {
        // Try to find order by route param first
        let order = null;
        if (orderId) {
            order = await Order.findById(orderId);
        }

        // If no order found by ID, attempt to resolve via CheckoutRequestID or MpesaReceiptNumber
        if (!order) {
            const checkoutReqId = callbackData.CheckoutRequestID || callbackData.checkoutRequestID || (callbackData.CallbackMetadata && callbackData.CallbackMetadata.Item && callbackData.CallbackMetadata.Item.find ? callbackData.CallbackMetadata.Item.find(i => i.Name === 'CheckoutRequestID')?.Value : null);
            const mpesaReceipt = callbackData.CallbackMetadata && callbackData.CallbackMetadata.Item ? callbackData.CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber' || i.Name === 'MpesaReceipt')?.Value : null;

            if (checkoutReqId) {
                order = await Order.findOne({ 'paymentDetails.checkoutRequestId': checkoutReqId });
            }
            if (!order && mpesaReceipt) {
                order = await Order.findOne({ 'paymentDetails.transactionId': mpesaReceipt });
            }

            if (!order) {
                // Not fatal: still accept callback but log for manual reconciliation
                console.warn(`M-Pesa callback couldn't match an order. checkoutReqId=${checkoutReqId}, receipt=${mpesaReceipt}`);
                return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted (no matching order found)' });
            }
        }

        // Prevent duplicate processing
        if (order.paymentStatus === "paid") {
            console.info(`Order ${order._id} already marked as paid; ignoring callback.`);
            return res.json({ ResultCode: 0, ResultDesc: "Already processed" });
        }

        if (callbackData.ResultCode === 0) {
            const receipt = callbackData.CallbackMetadata && callbackData.CallbackMetadata.Item ? callbackData.CallbackMetadata.Item.find(
                (item) => item.Name === "MpesaReceiptNumber" || item.Name === 'MpesaReceipt'
            )?.Value : null;

            // Merge new details with existing ones instead of overwriting
            order.paymentStatus = "paid";
            order.paymentDetails.transactionId = receipt || order.paymentDetails.transactionId;
            order.paymentDetails.payload = callbackData;
            order.paymentDetails.paidAt = new Date();

        } else {
            // Merge failure details
            order.paymentStatus = "failed";
            order.paymentDetails.payload = callbackData;
            order.paymentDetails.failedAt = new Date();
            order.paymentDetails.failureReason = callbackData.ResultDesc || callbackData.ResultDesc || 'Unknown';
        }

        await order.save();
        res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
        res.status(500).json({ ResultCode: 1, ResultDesc: "Failed" });
    }
});

// 🟢 3. Get Order Status
mpesaRouter.get("/api/mpesa/orders/:orderId", auth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ msg: "Order not found" });
        res.json(order);
    } catch (error) {
        res.status(500).json({ msg: "Server error" });
    }
});

// 🟢 4. Transaction Status Query (manual verification)
mpesaRouter.post("/api/mpesa/transaction-status/:orderId", auth, async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ msg: "Order not found" });

        const accessToken = await getAccessToken();

        const payload = {
            Initiator: process.env.MPESA_INITIATOR || "testapi",
            SecurityCredential: await getSecurityCredential(),
            CommandID: "TransactionStatusQuery",
            TransactionID: order.paymentDetails?.transactionId || "UNKNOWN",
            PartyA: MPESA_SHORTCODE,
            IdentifierType: "1",
            ResultURL: `${MPESA_CALLBACK_URL}/transaction/${orderId}?secret=${CALLBACK_SECRET}`,
            QueueTimeOutURL: `${MPESA_CALLBACK_URL}/timeout/${orderId}?secret=${CALLBACK_SECRET}`,
            Remarks: `Check status for order ${orderId}`,
            Occasion: "VerifyPayment"
        };

        const response = await axios.post(mpesaTransactionStatusUrl, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ msg: "Transaction status query failed", error: error.message });
    }
});

module.exports = mpesaRouter;

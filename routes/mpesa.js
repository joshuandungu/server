require('dotenv').config();

const express = require('express');
const axios = require('axios');
const auth = require('../middlewares/auth');
const Order = require('../models/order');

const mpesaRouter = express.Router();

// --- M-PESA CONFIGURATION ---
const MPESA_CONSUMER_KEY = "XT7jbFbpUeG0EzBJoT4yHCd70gnivoeqCAf2Ao4dI7aCJQUW";
const MPESA_CONSUMER_SECRET = "hfuESnzGCAYJJIgjL6JYeUhNt2UASl4S32soGhT2fk2LhmvEt0bGga6QmxACtZXu";
const MPESA_SHORTCODE = "174379"; // Paybill/Till
const MPESA_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const MPESA_ENV = "sandbox";

const MPESA_CALLBACK_URL = "https://your-ngrok-url.ngrok-free.app/api/mpesa/callback";
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET || "superSecretToken"; // extra layer of security

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

// Helper: Get Access Token
const getAccessToken = async () => {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const response = await axios.get(mpesaAuthUrl, {
        headers: { Authorization: `Basic ${auth}` },
    });
    return response.data.access_token;
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

        // Update order status = initiated
        await Order.findByIdAndUpdate(orderId, {
            paymentStatus: "initiated",
            paymentDetails: {
                method: "M-Pesa",
                initiatedAt: new Date(),
                amount: amount
            }
        });

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
        if (!response.data || !response.data.CheckoutRequestID) {
            throw new Error("Invalid response from M-Pesa API");
        }

        await Order.findByIdAndUpdate(orderId, {
            'paymentDetails.checkoutRequestId': response.data.CheckoutRequestID,
            'paymentDetails.responseCode': response.data.ResponseCode
        });

        res.json({
            ...response.data,
            message: "STK push initiated successfully"
        });

    } catch (error) {
        // Ensure order exists before updating status
        try {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: "failed",
                paymentDetails: {
                    method: "M-Pesa",
                    error: error.message,
                    failedAt: new Date()
                }
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

    const callbackData = req.body.Body.stkCallback;

    try {
        let order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }

        // Prevent duplicate processing
        if (order.paymentStatus === "paid") {
            return res.json({ ResultCode: 0, ResultDesc: "Already processed" });
        }

        if (callbackData.ResultCode === 0) {
            const receipt = callbackData?.CallbackMetadata?.Item?.find(
                (item) => item.Name === "MpesaReceiptNumber"
            )?.Value;

            // Merge new details with existing ones instead of overwriting
            order.paymentStatus = "paid";
            order.paymentDetails.transactionId = receipt;
            order.paymentDetails.payload = callbackData;
            order.paymentDetails.paidAt = new Date();

        } else {
            // Merge failure details
            order.paymentStatus = "failed";
            order.paymentDetails.payload = callbackData;
            order.paymentDetails.failedAt = new Date();
            order.paymentDetails.failureReason = callbackData.ResultDesc;
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
            // IMPORTANT: This needs to be generated by encrypting your Daraja security password with the public key from the portal
            // and then base64 encoding the result. The value here is a placeholder.
            SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || "yourEncryptedCredential",
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

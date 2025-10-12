const axios = require("axios");

const API_URL = "http://localhost:5000/api/mpesa/stk-push";

// Replace these values 👇 with your real test values
const JWT_TOKEN = "12345678"; // From login
const ORDER_ID = "66e5c28d9d2d8e001f1a2bc9"; // Replace with real MongoDB order _id
const PHONE_NUMBER = "0743314978"; // Must be M-Pesa registered
const AMOUNT = 1; // At least 1 KES

async function testStkPush() {
  try {
    const response = await axios.post(
      API_URL,
      {
        amount: AMOUNT,
        phoneNumber: PHONE_NUMBER,
        orderId: ORDER_ID,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": JWT_TOKEN,
        },
      }
    );

    console.log("✅ STK Push initiated successfully!");
    console.log("Safaricom Response:", response.data);
  } catch (error) {
    console.error("❌ STK Push failed.");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }
  }
}

testStkPush();

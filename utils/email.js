const nodemailer = require("nodemailer");
const config = require("../config/config");

// Validate Gmail credentials
if (!config.GMAIL_USER || !config.GMAIL_PASS) {
    console.error("ERROR: Gmail credentials not found in environment variables!");
    console.error("Please set GMAIL_USER and GMAIL_PASS in your .env file");
    console.error("See setup instructions below:");
    console.error("1. Enable 2-Factor Authentication on your Gmail account");
    console.error("2. Generate an App Password: https://support.google.com/accounts/answer/185833");
    console.error("3. Add to .env file: GMAIL_USER=your-email@gmail.com");
    console.error("4. Add to .env file: GMAIL_PASS=your-app-password");
}

// Create a transporter using Google SMTP
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: config.GMAIL_USER, // Your Gmail address
        pass: config.GMAIL_PASS, // Your Gmail app password or OAuth2 token
    },
});

// Send email function
async function sendEmail(to, subject, text) {
    const mailOptions = {
        from: config.GMAIL_USER,
        to,
        subject,
        text,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
}

module.exports = { sendEmail };

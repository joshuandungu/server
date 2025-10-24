const dotenv = require('dotenv');
dotenv.config();

const requiredEnvVars = ['MONGODB_URL', 'JWT_SECRET', 'JWT_RESET_SECRET', 'GMAIL_USER', 'GMAIL_PASS'];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        throw new Error(`Environment variable ${varName} is missing. Please check your .env file.`);
    }
}

module.exports = {
    MONGODB_URL: process.env.MONGODB_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_RESET_SECRET: process.env.JWT_RESET_SECRET,
    GMAIL_USER: process.env.GMAIL_USER,
    GMAIL_PASS: process.env.GMAIL_PASS,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000', // Good practice to add this for the reset link
};

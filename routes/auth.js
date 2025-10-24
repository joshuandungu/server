const express = require("express");
const User = require("../models/user");
const authRouter = express.Router();
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middlewares/auth");
const config = require("../config/config.js");
const { sendEmail } = require("../utils/email");
const { passwordResetTemplate } = require("../utils/emailTemplates"); // Updated import
const crypto = require("crypto"); // crypto is used for verification code, which is fine.

// SIGN UP
authRouter.post("/api/signup", async (req, res) => {
    try {
        const { name, email, password, role, latitude, longitude, phoneNumber } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ msg: "Email address already exists" });
        }
        if (password.length < 6) {
            return res.status(400).json({ msg: "Password must be at least 6 characters" });
        }
        const hashedPassword = await bcryptjs.hash(password, 8);

        // Generate a random 6-digit verification code
        const verificationCode = crypto.randomInt(100000, 999999).toString();

        let user = new User({
            email,
            password: hashedPassword,
            name,
            type: role || 'user',
            isEmailVerified: false,
            emailVerificationCode: verificationCode,
            status: "active",
            latitude: latitude,
            longitude: longitude,
            phoneNumber: phoneNumber,
        });
        user = await user.save();

        // Send verification code email
        const subject = "Your Email Verification Code";
        const text = `Your verification code is: ${verificationCode}`;
        await sendEmail(email, subject, text);

        res.json({ _id: user._id, msg: "User registered successfully. Please check your email for verification code." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }

});

// Sign In Route
authRouter.post("/api/signin", async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "User with this email does not exist!" });
        }

        if (role && user.type !== role) {
            return res.status(400).json({ msg: `This account is not registered as a ${role}.` });
        }
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Incorrect password!" });
        }

        if (!user.isEmailVerified) {
            return res.status(400).json({ msg: "Please verify your email before signing in." });
        }

        const token = jwt.sign({ id: user._id }, config.JWT_SECRET);
        res.json({ token, ...user._doc });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Check Token
authRouter.post("/tokenIsValid", async (req, res) => {
    try {
        const token = req.header("x-auth-token");
        if (!token) return res.json(false);
        const verified = jwt.verify(token, config.JWT_SECRET);
        if (!verified) return res.json(false);
        const user = await User.findById(verified.id);
        if (!user) return res.json(false);
        res.json(true);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// get user data
authRouter.get('/', auth, async (req, res) => {
    const user = await User.findById(req.user);
    res.json({ ...user._doc, token: req.token });
});

// Request Password Reset (Forgot Password)
authRouter.post("/api/reset-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            // To prevent email enumeration, send a generic success message even if the user doesn't exist.
            return res.json({ msg: "If a user with this email exists, a password reset link has been sent." });
        }

        // Generate a secure random token
        const resetToken = crypto.randomBytes(32).toString("hex");
        const passwordResetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        const passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        user.passwordResetToken = passwordResetToken;
        user.passwordResetExpires = passwordResetExpires;
        await user.save();

        // Send the email with the reset link
        const resetURL = `${config.FRONTEND_URL}/reset-password?token=${resetToken}`;
        const subject = "Your Password Reset Link (Valid for 10 minutes)";
        await sendEmail(user.email, subject, passwordResetTemplate(resetURL, user.name));

        res.json({ msg: "If a user with this email exists, a password reset link has been sent." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Password Route
authRouter.post("/api/update-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        // Hash the incoming token to match the one in the DB
        const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ msg: "Token is invalid or has expired." });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ msg: "Password must be at least 6 characters" });
        }

        const hashedPassword = await bcryptjs.hash(newPassword, 8);
        user.password = hashedPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.json({ msg: "Password updated successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

authRouter.post("/api/verify-email", async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "User with this email does not exist!" });
        }
        if (user.isEmailVerified) {
            return res.status(400).json({ msg: "Email is already verified." });
        }
        if (user.emailVerificationCode !== code) {
            return res.status(400).json({ msg: "Invalid verification code." });
        }
        user.isEmailVerified = true;
        user.emailVerificationCode = null;
        await user.save();
        res.json({ msg: "Email verified successfully." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

authRouter.post("/api/resend-verification-code", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: "This email is not registered!" });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ msg: "This email is already verified." });
        }

        // Generate a new 6-digit verification code
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        user.emailVerificationCode = verificationCode;
        await user.save();

        // Send verification code email
        const subject = "Your New Email Verification Code";
        const text = `Your new verification code is: ${verificationCode}`;
        await sendEmail(email, subject, text);

        res.json({ msg: "Verification code has been resent successfully!" });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = authRouter;

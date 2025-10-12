const express = require("express");
const User = require("../models/user");
const authRouter = express.Router();
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middlewares/auth");
const config = require("../config/config.js");
const { sendEmail } = require("../utils/email");
const crypto = require("crypto");

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
            latitude: latitude,
            longitude: longitude,
            phoneNumber: phoneNumber,
        });
        user = await user.save();

        // Send verification code email
        const subject = "Your Email Verification Code";
        const text = `Your verification code is: ${verificationCode}`;
        await sendEmail(email, subject, text);

        res.json({ _id: user._id, msg: "User registered successfully. Verification code sent to email." });
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
        if (!user.isEmailVerified) {
            return res.status(400).json({ msg: "Email not verified. Please verify your email before signing in." });
        }
        if (role && user.type !== role) {
            return res.status(400).json({ msg: `This account is not registered as a ${role}.` });
        }
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Incorrect password!" });
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


authRouter.post("/api/reset-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "User with this email does not exist!" });
        }


        const resetToken = jwt.sign(
            { id: user._id },
            config.JWT_RESET_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ resetToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Password Route
authRouter.post("/api/update-password", async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (newPassword.length < 6) {
            return res.status(400).json({ msg: "Password must be at least 6 characters" });
        }

        const verified = jwt.verify(resetToken, config.JWT_RESET_SECRET);
        if (!verified) {
            return res.status(400).json({ msg: "Invalid or expired reset token" });
        }

        const hashedPassword = await bcryptjs.hash(newPassword, 8);
        await User.findByIdAndUpdate(
            verified.id,
            { password: hashedPassword }
        );

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

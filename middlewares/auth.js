// Example for: server/middlewares/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config/config'); // <-- Add this import

const auth = async (req, res, next) => {
    try {
        const token = req.header('x-auth-token');
        if (!token) return res.status(401).json({ msg: 'No auth token, access denied' });

        // Use the secret from the config file
        const verified = jwt.verify(token, config.JWT_SECRET); 
        if (!verified) return res.status(401).json({ msg: 'Token verification failed, authorization denied.' });

        req.user = verified.id;
        req.token = token;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = auth;

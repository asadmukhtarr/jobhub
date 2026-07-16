// middleware/auth.js

const authMiddleware = {
    // Middleware to check if user is logged in
    isAuthenticated: (req, res, next) => {
        if (req.session && req.session.isLoggedIn) {
            return next();
        }
        // Store the original URL to redirect back after login
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    },

    // Middleware to redirect if already logged in
    isGuest: (req, res, next) => {
        if (req.session && req.session.isLoggedIn) {
            return res.redirect('/dashboard');
        }
        return next();
    }
};

module.exports = authMiddleware;
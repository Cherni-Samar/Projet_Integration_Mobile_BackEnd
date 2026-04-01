// messageProcessingMiddleware.js

// Middleware function to process messages
const messageProcessingMiddleware = (req, res, next) => {
    // Example message processing logic
    const message = req.body.message;
    if (message) {
        console.log(`Processing message: ${message}`);
        // Add additional processing logic here
    }
    next();
};

module.exports = messageProcessingMiddleware;
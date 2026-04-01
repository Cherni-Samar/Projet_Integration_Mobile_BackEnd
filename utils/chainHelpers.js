// Utility functions for LangChain chain management and message processing

/**
 * Function to create a new chain
 * @param {Array} operations - Array of operations for the chain
 * @returns {Object} - The created chain object
 */
function createChain(operations) {
    return { operations };
}

/**
 * Function to process messages through the chain
 * @param {Object} chain - The chain object
 * @param {String} input - The input message
 * @returns {String} - The processed output message
 */
function processMessage(chain, input) {
    return chain.operations.reduce((acc, operation) => {
        // Assume operation is a function that takes a message and returns a new message
        return operation(acc);
    }, input);
}

module.exports = { createChain, processMessage };
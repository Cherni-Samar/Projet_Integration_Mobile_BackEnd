class MessageProcessor {
    constructor() {
        this.history = [];
        this.highPriorityMessages = [];
    }

    processMessage(message) {
        // Process a single message and update history
        this.history.push(message);
        // Logic to determine if it's high priority
        if (this.isHighPriority(message)) {
            this.highPriorityMessages.push(message);
        }
    }

    processMessages(messages) {
        // Process multiple messages
        messages.forEach(message => this.processMessage(message));
    }

    summarizeHistory() {
        // Logic to summarize message history
        return this.history.reduce((summary, msg) => summary + ' ' + msg.content, '');
    }

    getHighPriorityMessages() {
        // Return high priority messages
        return this.highPriorityMessages;
    }

    clearHistory() {
        // Clear all stored message history
        this.history = [];
        this.highPriorityMessages = [];
    }

    getStatistics() {
        // Provide statistics about processed messages
        return {
            totalMessages: this.history.length,
            highPriorityCount: this.highPriorityMessages.length,
        };
    }

    isHighPriority(message) {
        // Logic to check if a message is high priority
        // Placeholder for actual logic
        return message.priority === 'high';
    }
}

module.exports = MessageProcessor;
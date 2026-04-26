/**
 * Autonomous Service - Simplified Version
 * Starts and manages DEXO autonomous components
 */

const AutonomousDocumentWatcher = require('../agents/AutonomousDocumentWatcher');
const DexoAgent = require('../agents/DexoAgent');

class AutonomousService {
    constructor() {
        this.documentWatcher = null;
        this.dexoAgent = null;
        this.isRunning = false;
        this.startTime = null;
        
        console.log('🤖 DEXO Autonomous Service: Initializing...');
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ DEXO: Autonomous service already running');
            return;
        }

        try {
            this.startTime = new Date();
            
            // Initialize DEXO Agent
            this.dexoAgent = new DexoAgent();
            console.log('✅ DEXO: Autonomous agent initialized');
            
            // Start document watcher
            this.documentWatcher = new AutonomousDocumentWatcher();
            console.log('✅ DEXO: Document watcher started');
            
            this.isRunning = true;
            
            console.log('🚀 DEXO AUTONOMOUS SERVICE STARTED');
            console.log('📁 Monitoring directories for automatic document processing');
            console.log('🤖 AI will process all documents without user input');
            console.log('👁️ Users only need to watch - no interaction required');
            
        } catch (error) {
            console.error('❌ DEXO: Failed to start autonomous service:', error.message);
            throw error;
        }
    }

    async processDocumentDirectly(filename, content, userId = 'autonomous', metadata = {}) {
        if (!this.isRunning) {
            throw new Error('Autonomous service not running');
        }

        console.log(`🤖 DEXO: Direct autonomous processing - ${filename}`);
        
        const enhancedMetadata = {
            ...metadata,
            processedBy: 'autonomous-service',
            directProcessing: true,
            timestamp: new Date()
        };

        return await this.dexoAgent.processDocument(filename, content, userId, enhancedMetadata);
    }

    async addDocumentToWatcher(filePath, content, metadata = {}) {
        if (!this.documentWatcher) {
            throw new Error('Document watcher not initialized');
        }

        return await this.documentWatcher.addDocumentForProcessing(filePath, content, metadata);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            startTime: this.startTime,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            documentWatcher: this.documentWatcher ? this.documentWatcher.getStatus() : null,
            memoryUsage: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform
        };
    }

    async stop() {
        if (!this.isRunning) {
            console.log('⚠️ DEXO: Autonomous service not running');
            return;
        }

        try {
            // Stop document watcher
            if (this.documentWatcher) {
                this.documentWatcher.stop();
                this.documentWatcher = null;
            }

            this.isRunning = false;
            
            console.log('🛑 DEXO: Autonomous service stopped');
            
        } catch (error) {
            console.error('❌ DEXO: Error stopping autonomous service:', error.message);
        }
    }

    // Convenience methods for external API
    enableAutoProcessing() {
        if (this.documentWatcher) {
            this.documentWatcher.enableAutoProcessing();
        }
    }

    disableAutoProcessing() {
        if (this.documentWatcher) {
            this.documentWatcher.disableAutoProcessing();
        }
    }
}

// Create singleton instance
const autonomousService = new AutonomousService();

module.exports = autonomousService;
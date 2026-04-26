/**
 * Autonomous Document Watcher - Simplified Version
 * Monitors directories and processes documents automatically without user input
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs').promises;
const DexoAgent = require('./DexoAgent');

class AutonomousDocumentWatcher {
    constructor() {
        this.dexoAgent = new DexoAgent();
        this.watchers = [];
        this.processingQueue = [];
        this.isProcessing = false;
        this.autoProcessingEnabled = true;
        
        // Simplified watched directories
        this.watchedDirectories = [
            'documents/incoming',
            'documents/temp'
        ];
        
        console.log('🤖 DEXO: Autonomous Document Watcher initialized');
    }

    async initializeWatchedDirectories() {
        for (const dir of this.watchedDirectories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`📁 Created/verified directory: ${dir}`);
            } catch (error) {
                console.log(`📁 Directory exists: ${dir}`);
            }
        }
    }

    startWatching() {
        console.log('👁️ DEXO: Starting autonomous file watching...');
        
        this.initializeWatchedDirectories();
        
        // Watch for new files
        const watcher = chokidar.watch(this.watchedDirectories, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true
        });

        watcher
            .on('add', (filePath) => this.onFileAdded(filePath))
            .on('change', (filePath) => this.onFileChanged(filePath));

        this.watchers.push(watcher);
        
        // Start processing queue
        this.startAutoProcessing();
        
        console.log('✅ DEXO: Autonomous watching started');
    }
    async onFileAdded(filePath) {
        console.log(`📄 DEXO: New file detected - ${path.basename(filePath)}`);
        await this.queueDocumentForProcessing(filePath, 'added');
    }

    async onFileChanged(filePath) {
        console.log(`📝 DEXO: File changed - ${path.basename(filePath)}`);
        await this.queueDocumentForProcessing(filePath, 'changed');
    }

    async queueDocumentForProcessing(filePath, eventType) {
        if (!this.shouldProcessFile(filePath)) {
            return;
        }

        const item = {
            filePath,
            eventType,
            timestamp: new Date(),
            attempts: 0
        };

        this.processingQueue.push(item);
        console.log(`📋 DEXO: Queued for processing - ${path.basename(filePath)} (${this.processingQueue.length} in queue)`);
    }

    shouldProcessFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const supportedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xls', '.xlsx'];
        return supportedExtensions.includes(ext);
    }

    async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0 || !this.autoProcessingEnabled) {
            return;
        }

        this.isProcessing = true;
        
        while (this.processingQueue.length > 0) {
            const item = this.processingQueue.shift();
            
            try {
                console.log(`🤖 DEXO: Processing ${path.basename(item.filePath)} autonomously...`);
                await this.processDocumentAutonomously(item);
                
            } catch (error) {
                console.error(`❌ DEXO: Processing failed for ${item.filePath}:`, error.message);
                item.attempts++;
                
                if (item.attempts < 3) {
                    this.processingQueue.push(item); // Retry
                }
            }
        }
        
        this.isProcessing = false;
    }
    async processDocumentAutonomously(item) {
        const { filePath, eventType } = item;
        const fileName = path.basename(filePath);

        try {
            // Read file content
            const content = await fs.readFile(filePath, 'utf8');
            
            // Process with DEXO AI
            const result = await this.dexoAgent.processDocument(fileName, content, 'autonomous', {
                originalPath: filePath,
                eventType,
                autonomousProcessing: true
            });

            if (result.success) {
                console.log(`✅ DEXO: Successfully processed ${fileName} autonomously`);
                
                // Move processed file
                await this.moveProcessedFile(filePath, result);
                
                // Send notification
                await this.sendAutonomousNotification(fileName, result);
                
            } else {
                console.log(`⚠️ DEXO: Processing completed with issues for ${fileName}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ DEXO: Error processing ${fileName}:`, error.message);
            throw error;
        }
    }

    async moveProcessedFile(originalPath, result) {
        try {
            const fileName = path.basename(originalPath);
            const processedDir = 'documents/processed';
            
            await fs.mkdir(processedDir, { recursive: true });
            const newPath = path.join(processedDir, fileName);
            
            await fs.rename(originalPath, newPath);
            console.log(`📁 DEXO: Moved processed file to ${newPath}`);
            
        } catch (error) {
            console.log(`📁 DEXO: Could not move file (file may be in use): ${error.message}`);
        }
    }
    async sendAutonomousNotification(fileName, result) {
        console.log(`📢 DEXO: Autonomous processing complete for ${fileName}`);
        console.log(`   Category: ${result.classification?.category || 'Unknown'}`);
        console.log(`   Confidence: ${Math.round((result.classification?.confidence || 0) * 100)}%`);
        console.log(`   Security: ${result.securityCheck?.alertLevel || 'OK'}`);
        console.log(`   AI Decisions: ${Object.keys(result.autonomousDecisions || {}).length}`);
    }

    startAutoProcessing() {
        // Process queue every 10 seconds
        setInterval(() => {
            this.processQueue();
        }, 10000);
        
        console.log('🔄 DEXO: Auto-processing started (10s intervals)');
    }

    enableAutoProcessing() {
        this.autoProcessingEnabled = true;
        console.log('✅ DEXO: Auto-processing enabled');
    }

    disableAutoProcessing() {
        this.autoProcessingEnabled = false;
        console.log('⏸️ DEXO: Auto-processing disabled');
    }

    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueLength: this.processingQueue.length,
            autoProcessingEnabled: this.autoProcessingEnabled,
            watchedDirectories: this.watchedDirectories,
            watchersActive: this.watchers.length
        };
    }

    async addDocumentForProcessing(filePath, content, metadata = {}) {
        console.log(`📄 DEXO: Adding document for autonomous processing - ${path.basename(filePath)}`);
        
        // Process immediately
        const result = await this.dexoAgent.processDocument(path.basename(filePath), content, 'autonomous', {
            ...metadata,
            directAdd: true,
            timestamp: new Date()
        });
        
        console.log(`✅ DEXO: Document processed autonomously`);
        return result;
    }

    stop() {
        console.log('🛑 DEXO: Stopping autonomous document watcher...');
        
        this.watchers.forEach(watcher => watcher.close());
        this.watchers = [];
        this.processingQueue = [];
        this.isProcessing = false;
        
        console.log('✅ DEXO: Autonomous watcher stopped');
    }
}

module.exports = AutonomousDocumentWatcher;
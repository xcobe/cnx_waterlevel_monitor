const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');

// 配置
const CONFIG_FILE = path.join(__dirname, 'station_config.json');
const STATION_DATA_DIR = path.join(__dirname, 'station_data_server');
const COLLECTION_INTERVAL = 60 * 60 * 1000; // 60分钟采集一次
const API_TIMEOUT = 30000; // 30秒超时

// 日志函数
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// 确保目录存在
async function ensureDirectory(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            log(`Created directory: ${dirPath}`);
        } else {
            throw error;
        }
    }
}

// 读取水文站配置文件
async function loadStationConfig() {
    try {
        const configData = await fs.readFile(CONFIG_FILE, 'utf8');
        const config = JSON.parse(configData);
        
        if (!config.stations || !Array.isArray(config.stations)) {
            throw new Error('Invalid station configuration: stations array is required');
        }
        
        log(`Loaded ${config.stations.length} stations from configuration`);
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            log('Configuration file not found, creating default config', 'WARN');
            const defaultConfig = {
                stations: [
                    { id: 'P.1', name: 'Station 1', apiUrl: 'https://api.example.com/station/P.1' },
                    { id: 'P.2', name: 'Station 2', apiUrl: 'https://api.example.com/station/P.2' },
                    { id: 'P.93', name: 'Station 93', apiUrl: 'https://api.example.com/station/P.93' }
                ],
                apiConfig: {
                    timeout: 30000,
                    retries: 3,
                    retryDelay: 5000
                }
            };
            await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
            log('Created default configuration file');
            return defaultConfig;
        }
        throw error;
    }
}

// HTTP/HTTPS请求函数
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: options.timeout || API_TIMEOUT,
            headers: {
                'User-Agent': 'WaterLevelDataCollector/1.0',
                'Accept': 'application/json'
            }
        };
        
        const req = client.request(requestOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON response: ${error.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// 生成文件名（基于当前时间）
function generateFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    
    // 小时数据文件名：YYYYMMDDHH
    return `${year}${month}${day}${hour}`;
}

// 保存水文站数据
async function saveStationData(stationId, data) {
    try {
        const fileName = generateFileName();
        const filePath = path.join(STATION_DATA_DIR, `${stationId}.${fileName}`);
        
        // 添加时间戳和元数据
        const dataWithMetadata = {
            ...data,
            metadata: {
                collectedAt: new Date().toISOString(),
                stationId: stationId,
                fileName: fileName,
                updatedAt: new Date().toISOString(),
                isLatest: true
            }
        };
        
        // 检查文件是否已存在
        try {
            await fs.access(filePath);
            // 文件存在，读取旧数据
            const oldData = JSON.parse(await fs.readFile(filePath, 'utf8'));
            
            // 如果旧数据有metadata，保留其collectedAt时间
            if (oldData.metadata && oldData.metadata.collectedAt) {
                dataWithMetadata.metadata.collectedAt = oldData.metadata.collectedAt;
            }
            
            // 更新文件
            await fs.writeFile(filePath, JSON.stringify(dataWithMetadata, null, 2));
            log(`Updated existing data file for station ${stationId}: ${fileName}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在，创建新文件
                await fs.writeFile(filePath, JSON.stringify(dataWithMetadata, null, 2));
                log(`Created new data file for station ${stationId}: ${fileName}`);
            } else {
                throw error;
            }
        }
        
        return filePath;
    } catch (error) {
        log(`Failed to save data for station ${stationId}: ${error.message}`, 'ERROR');
        throw error;
    }
}

// 采集单个水文站数据
async function collectStationData(station, config) {
    try {
        log(`Collecting data for station ${station.id} from ${station.apiUrl}`);
        
        const data = await makeRequest(station.apiUrl, config.apiConfig);
        
        if (!data) {
            throw new Error('Empty response from API');
        }
        
        await saveStationData(station.id, data);
        log(`Successfully collected data for station ${station.id}`);
        
        return {
            stationId: station.id,
            success: true,
            data: data
        };
    } catch (error) {
        log(`Failed to collect data for station ${station.id}: ${error.message}`, 'ERROR');
        return {
            stationId: station.id,
            success: false,
            error: error.message
        };
    }
}

// 批量采集所有水文站数据
async function collectAllStationData() {
    try {
        log('Starting data collection cycle');
        
        const config = await loadStationConfig();
        const results = [];
        
        // 并发采集所有水文站数据
        const promises = config.stations.map(station => 
            collectStationData(station, config)
        );
        
        const stationResults = await Promise.allSettled(promises);
        
        let successCount = 0;
        let failureCount = 0;
        
        stationResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    successCount++;
                } else {
                    failureCount++;
                }
                results.push(result.value);
            } else {
                failureCount++;
                results.push({
                    stationId: config.stations[index].id,
                    success: false,
                    error: result.reason.message
                });
            }
        });
        
        log(`Data collection completed: ${successCount} successful, ${failureCount} failed`);
        
        return {
            timestamp: new Date().toISOString(),
            totalStations: config.stations.length,
            successCount,
            failureCount,
            results
        };
    } catch (error) {
        log(`Data collection cycle failed: ${error.message}`, 'ERROR');
        throw error;
    }
}

// 清理旧数据文件 - 修改为不删除文件，只标记非最新
async function cleanupOldData() {
    try {
        const files = await fs.readdir(STATION_DATA_DIR);
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7天前
        
        let updatedCount = 0;
        
        for (const file of files) {
            const filePath = path.join(STATION_DATA_DIR, file);
            const stats = await fs.stat(filePath);
            
            // 检查文件是否超过7天
            if (stats.mtime < cutoffDate) {
                try {
                    // 读取文件内容
                    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
                    
                    // 如果文件有metadata，更新isLatest标记
                    if (data.metadata) {
                        data.metadata.isLatest = false;
                        data.metadata.archivedAt = new Date().toISOString();
                        
                        // 写回文件
                        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                        updatedCount++;
                        log(`Marked file as archived: ${file}`);
                    }
                } catch (error) {
                    log(`Error processing file ${file}: ${error.message}`, 'WARN');
                }
            }
        }
        
        if (updatedCount > 0) {
            log(`Cleanup completed: marked ${updatedCount} files as archived`);
        }
    } catch (error) {
        log(`Cleanup failed: ${error.message}`, 'ERROR');
    }
}

// 主循环
async function mainLoop() {
    try {
        await ensureDirectory(STATION_DATA_DIR);
        
        // 立即执行一次数据采集
        await collectAllStationData();
        
        // 设置定时器
        setInterval(async () => {
            try {
                await collectAllStationData();
                
                // 每天凌晨2点执行清理
                const now = new Date();
                if (now.getHours() === 2 && now.getMinutes() < 5) {
                    await cleanupOldData();
                }
            } catch (error) {
                log(`Main loop error: ${error.message}`, 'ERROR');
            }
        }, COLLECTION_INTERVAL);
        
        log(`Data collector service started. Collection interval: ${COLLECTION_INTERVAL / 1000} seconds`);
    } catch (error) {
        log(`Failed to start data collector service: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

// 信号处理
process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'ERROR');
    process.exit(1);
});

// 启动服务
if (require.main === module) {
    mainLoop();
}

module.exports = {
    collectAllStationData,
    loadStationConfig,
    cleanupOldData
}; 
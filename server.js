const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 80;

// 启用 CORS
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static('.'));

// 定义数据目录
const STATION_DATA_DIR = path.join(__dirname, 'station_data');

// 确保根目录存在
async function ensureRootDirectory() {
    try {
        await fs.access(STATION_DATA_DIR);
        console.log(`Directory exists: ${STATION_DATA_DIR}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(STATION_DATA_DIR, { recursive: true });
                console.log(`Created directory: ${STATION_DATA_DIR}`);
            } catch (mkdirError) {
                console.error('Error creating directory:', mkdirError);
                throw mkdirError;
            }
        } else {
            console.error('Error checking directory:', error);
            throw error;
        }
    }
}

// 确保目录存在并返回文件路径
async function ensureDirectoryAndGetPath(fileName, req) {
    await ensureRootDirectory();
    // 从请求头获取 stationId
    const stationId = req.headers['x-station-id'] || 'P.93'; // 默认值，实际应该从请求头获取
    return path.join(STATION_DATA_DIR, `${stationId}.${fileName}`);
}

// 列出文件 - 这个路由必须在 /station-data/:fileName 之前
app.get('/station-data/list', async (req, res) => {
    try {
        const stationId = req.headers['x-station-id'] || 'P.1';
        await ensureRootDirectory();
        
        try {
            const files = await fs.readdir(STATION_DATA_DIR);
            // 只返回当前站点的文件，并按文件名排序
            const stationFiles = files
                .filter(file => file.startsWith(`${stationId}.`))
                .sort((a, b) => {
                    // 提取文件名中的日期部分进行比较
                    const dateA = a.split('.')[1];
                    const dateB = b.split('.')[1];
                    return dateB.localeCompare(dateA); // 降序排序
                });
            res.json(stationFiles);
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.json([]);
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 清理旧数据 - 这个路由也必须在 /station-data/:fileName 之前
app.delete('/station-data/cleanup', async (req, res) => {
    try {
        const { cutoffFileName } = req.query;
        const stationId = req.headers['x-station-id'] || 'P.1';
        
        // 验证文件名格式
        if (!cutoffFileName || !/^\d{8,10}$/.test(cutoffFileName)) {
            console.log(`Invalid cutoff file name format: ${cutoffFileName}`);
            return res.status(400).json({ error: 'Invalid cutoff file name format' });
        }

        await ensureRootDirectory();
        const stationPrefix = `${stationId}.`;

        try {
            const files = await fs.readdir(STATION_DATA_DIR);
            let deletedCount = 0;

            for (const file of files) {
                if (file.startsWith(stationPrefix)) {
                    const fileName = file.slice(stationPrefix.length);
                    if (fileName < cutoffFileName) {
                        await fs.unlink(path.join(STATION_DATA_DIR, file));
                        console.log(`Removed old data file: ${file}`);
                        deletedCount++;
                    }
                }
            }
            res.json({ success: true, deletedCount });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.json({ success: true, message: 'No data directory found' });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error cleaning up data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 获取数据 - 这个路由必须在特定路由之后
app.get('/station-data/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        const stationId = req.headers['x-station-id'] || 'P.93';
        
        // 检查是否是 list 请求（通过路径）
        if (fileName === 'list') {
            // 重定向到正确的 list 端点
            return res.redirect('/station-data/list');
        }
        
        console.log('Request headers:', req.headers);
        console.log('Station ID from headers:', stationId);
        console.log('File name from params:', fileName);
        
        // 验证文件名格式（8位数字为日数据，10位数字为小时数据）
        if (!/^\d{8,10}$/.test(fileName)) {
            console.log(`Invalid file name format: ${fileName}`);
            return res.status(400).json({ 
                error: 'Invalid file name format',
                message: 'File name must be 8 digits (YYYYMMDD) or 10 digits (YYYYMMDDHH)'
            });
        }

        const filePath = await ensureDirectoryAndGetPath(fileName, req);
        console.log(`Reading data from: ${filePath}`);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsedData = JSON.parse(data);
            
            // 处理空字段
            if (parsedData) {
                // 确保关键字段存在，如果为空则设置为默认值
                parsedData.level1 = parsedData.level1 || "0";
                parsedData.dischg = parsedData.dischg || "0";
                parsedData.time = parsedData.time || "";
                parsedData.date = parsedData.date || "";
            }
            
            // 设置响应头，确保客户端能正确处理 JSON 数据
            res.setHeader('Content-Type', 'application/json');
            res.json(parsedData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`File not found: ${filePath}`);
                // 设置响应头，确保客户端能正确处理 JSON 错误
                res.setHeader('Content-Type', 'application/json');
                res.status(404).json({ 
                    error: 'Data not found',
                    message: `No data available for ${fileName}`
                });
            } else if (error instanceof SyntaxError) {
                console.error(`Invalid JSON in file ${filePath}:`, error);
                res.setHeader('Content-Type', 'application/json');
                res.status(500).json({ 
                    error: 'Invalid data format',
                    message: 'The stored data is not in valid JSON format'
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error reading data:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});

// 保存数据
app.post('/station-data/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        
        // 验证文件名格式（8位数字为日数据，10位数字为小时数据）
        if (!/^\d{8,10}$/.test(fileName)) {
            console.log(`Invalid file name format: ${fileName}`);
            return res.status(400).json({ error: 'Invalid file name format' });
        }

        const filePath = await ensureDirectoryAndGetPath(fileName, req);
        console.log(`Saving data to: ${filePath}`);

        // 直接保存数据到根目录
        await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 删除文件
app.delete('/station-data/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        const stationId = req.headers['x-station-id'] || 'P.1';
        
        // 验证文件名格式
        if (!/^\d{8,10}$/.test(fileName)) {
            console.log(`Invalid file name format: ${fileName}`);
            return res.status(400).json({ error: 'Invalid file name format' });
        }

        const filePath = await ensureDirectoryAndGetPath(fileName, req);
        console.log(`Deleting file: ${filePath}`);

        try {
            await fs.unlink(filePath);
            res.json({ success: true });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({ error: 'File not found' });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 启动服务器前确保目录存在
async function startServer() {
    try {
        await ensureRootDirectory();
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// 启动服务器
startServer(); 
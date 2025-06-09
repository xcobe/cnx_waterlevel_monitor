# 水位监测系统 (Water Level Monitoring System)

一个基于Node.js的水位监测系统，包含Web界面和数据采集服务。

## 功能特性

- 🌊 实时水位数据监测
- 📊 数据可视化图表
- 🔄 自动数据采集服务
- 📁 数据文件管理
- 🚨 水位预警功能
- 🔧 系统服务管理

## 系统架构

系统包含两个主要组件：

1. **Web服务器** (`server.js`) - 提供Web界面和API接口
2. **数据采集服务** (`data-collector.js`) - 从远程API获取水文站数据

## 快速开始

### 开发环境

1. 安装依赖：
```bash
npm install
```

2. 启动Web服务器：
```bash
npm start
# 或开发模式
npm run dev
```

3. 启动数据采集服务：
```bash
npm run collector
# 或开发模式
npm run collector:dev
```

### 生产环境部署 (CentOS 7.6)

1. 克隆项目到服务器：
```bash
git clone <repository-url>
cd water-level-alert
```

2. 运行安装脚本：
```bash
sudo ./install.sh
```

安装脚本会自动完成以下操作：
- 安装Node.js 18.x
- 创建系统用户和组
- 配置systemd服务
- 设置防火墙规则
- 配置日志轮转
- 启动服务

## 配置说明

### 水文站配置

编辑 `station_config.json` 文件来配置水文站信息：

```json
{
  "stations": [
    {
      "id": "P.1",
      "name": "水文站1",
      "apiUrl": "https://api.example.com/station/P.1",
      "description": "示例水文站1"
    }
  ],
  "apiConfig": {
    "timeout": 30000,
    "retries": 3,
    "retryDelay": 5000
  },
  "collectionConfig": {
    "interval": 300000,
    "cleanupInterval": 604800000,
    "maxRetentionDays": 7
  }
}
```

### 配置参数说明

- `stations`: 水文站列表
  - `id`: 水文站编号（用于文件命名）
  - `name`: 水文站名称
  - `apiUrl`: 远程数据API地址
  - `description`: 水文站描述
  - `gis`: 地理信息系统信息
    - `latitude`: 纬度（Google Maps格式）
    - `longitude`: 经度（Google Maps格式）
    - `elevation`: 海拔高度（米）
    - `location`: 行政区划位置
    - `address`: 详细地址
    - `coordinateSystem`: 坐标系统（默认WGS84）

- `apiConfig`: API请求配置
  - `timeout`: 请求超时时间（毫秒）
  - `retries`: 重试次数
  - `retryDelay`: 重试延迟（毫秒）

- `collectionConfig`: 数据采集配置
  - `interval`: 采集间隔（毫秒，默认60分钟）
  - `cleanupInterval`: 清理间隔（毫秒）
  - `maxRetentionDays`: 数据保留天数（默认7天）

- `gisConfig`: 地理信息系统配置
  - `defaultCoordinateSystem`: 默认坐标系统（WGS84）
  - `mapProvider`: 地图提供商（Google Maps）
  - `mapZoomLevel`: 默认地图缩放级别
  - `mapCenter`: 默认地图中心点
    - `latitude`: 中心点纬度
    - `longitude`: 中心点经度

## 数据管理策略

### 文件命名规则

数据文件按照以下规则命名：
- 小时数据：`{stationId}.{YYYYMMDDHH}`
- 日数据：`{stationId}.{YYYYMMDD}`

例如：
- `P.1.2024120114` - P.1水文站2024年12月1日14时的数据
- `P.93.20241201` - P.93水文站2024年12月1日的数据

### 文件更新策略

系统采用以下策略管理数据文件：

1. **保留历史文件**：所有历史数据文件都会被保留，不会被删除
2. **更新同名文件**：如果发现同名文件，会用最新数据更新该文件
3. **文件元数据**：每个数据文件都包含以下元数据：
   - `collectedAt`: 首次采集时间
   - `updatedAt`: 最后更新时间
   - `stationId`: 水文站编号
   - `fileName`: 文件名
   - `isLatest`: 是否为最新数据
   - `archivedAt`: 归档时间（如果已归档）

### 数据归档

系统会定期（每天凌晨2点）检查数据文件：
- 超过7天的文件会被标记为"已归档"（`isLatest = false`）
- 归档文件会记录归档时间（`archivedAt`）
- 归档文件不会被删除，可以用于历史数据分析

### 数据目录结构

```
/opt/water-level-alert/
├── data-collector.js          # 数据采集服务
├── station_config.json        # 水文站配置
├── package.json              # 项目配置
├── station_data/             # Web服务器数据目录
└── station_data_server/      # 数据采集服务数据目录
    ├── P.1.2024120114.json   # 水文站数据文件（包含元数据）
    ├── P.2.2024120114.json
    └── P.93.2024120114.json
```

### 数据文件格式

每个数据文件都是JSON格式，包含以下结构：

```json
{
  "level1": "10.5",
  "dischg": "100.2",
  "time": "14:00",
  "date": "2024-12-01",
  "metadata": {
    "collectedAt": "2024-12-01T14:00:00Z",
    "updatedAt": "2024-12-01T14:05:00Z",
    "stationId": "P.1",
    "fileName": "2024120114",
    "isLatest": true,
    "archivedAt": null
  }
}
```

## 服务管理

### 启动服务
```bash
sudo systemctl start water-level-collector.service
```

### 停止服务
```bash
sudo systemctl stop water-level-collector.service
```

### 重启服务
```bash
sudo systemctl restart water-level-collector.service
```

### 查看服务状态
```bash
sudo systemctl status water-level-collector.service
```

### 查看日志
```bash
# 实时查看日志
sudo journalctl -u water-level-collector.service -f

# 查看最近的日志
sudo journalctl -u water-level-collector.service -n 100
```

## 卸载服务

如需完全移除服务，运行：
```bash
sudo ./uninstall.sh
```

## 故障排除

### 常见问题

1. **服务启动失败**
   - 检查Node.js是否正确安装
   - 查看日志：`journalctl -u water-level-collector.service`
   - 检查配置文件格式是否正确

2. **数据采集失败**
   - 检查网络连接
   - 验证API URL是否可访问
   - 检查API返回的数据格式

3. **权限问题**
   - 确保waterlevel用户有正确的文件权限
   - 检查目录权限设置

### 日志级别

服务支持以下日志级别：
- `INFO`: 一般信息
- `WARN`: 警告信息
- `ERROR`: 错误信息

## 开发说明

### 目录说明

系统使用两个独立的数据目录：

1. **station_data/** - Web服务器使用的数据目录
   - 用于存储Web界面展示的数据
   - 由Web服务器（server.js）管理

2. **station_data_server/** - 数据采集服务使用的数据目录
   - 用于存储数据采集服务获取的原始数据
   - 包含完整的元数据信息
   - 由数据采集服务（data-collector.js）管理
   - 便于后期测试和开发

### 添加新的水文站

1. 编辑 `station_config.json`
2. 添加新的水文站配置
3. 重启服务：`sudo systemctl restart water-level-collector.service`

### 修改采集间隔

1. 编辑 `station_config.json` 中的 `collectionConfig.interval`
2. 重启服务

### 自定义API处理

如需处理特殊的API响应格式，可以修改 `data-collector.js` 中的 `makeRequest` 函数。

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。 
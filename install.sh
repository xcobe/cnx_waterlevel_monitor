#!/bin/bash

# Water Level Data Collector Installation Script for CentOS 7.6
# 使用方法: sudo ./install.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
    fi
}

# 检查操作系统
check_os() {
    if [[ ! -f /etc/redhat-release ]]; then
        error "This script is designed for CentOS/RHEL systems"
    fi
    
    log "Detected OS: $(cat /etc/redhat-release)"
}

# 安装Node.js
install_nodejs() {
    log "Installing Node.js..."
    
    # 检查是否已安装Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log "Node.js already installed: $NODE_VERSION"
        return
    fi
    
    # 添加NodeSource仓库
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    
    # 安装Node.js
    yum install -y nodejs
    
    # 验证安装
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    log "Node.js installed: $NODE_VERSION"
    log "npm installed: $NPM_VERSION"
}

# 创建用户和组
create_user() {
    log "Creating waterlevel user and group..."
    
    # 创建组
    if ! getent group waterlevel > /dev/null; then
        groupadd waterlevel
        log "Created waterlevel group"
    else
        log "waterlevel group already exists"
    fi
    
    # 创建用户
    if ! getent passwd waterlevel > /dev/null; then
        useradd -r -g waterlevel -s /bin/false -d /opt/water-level-alert waterlevel
        log "Created waterlevel user"
    else
        log "waterlevel user already exists"
    fi
}

# 创建应用目录
create_directories() {
    log "Creating application directories..."
    
    # 创建应用目录
    mkdir -p /opt/water-level-alert
    mkdir -p /opt/water-level-alert/station_data
    mkdir -p /opt/water-level-alert/station_data_server
    mkdir -p /var/log/water-level-collector
    
    # 设置权限
    chown -R waterlevel:waterlevel /opt/water-level-alert
    chown -R waterlevel:waterlevel /var/log/water-level-collector
    chmod 755 /opt/water-level-alert
    chmod 755 /opt/water-level-alert/station_data
    chmod 755 /opt/water-level-alert/station_data_server
    chmod 755 /var/log/water-level-collector
    
    log "Directories created and permissions set"
}

# 复制应用文件
copy_files() {
    log "Copying application files..."
    
    # 获取脚本所在目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # 复制文件
    cp "$SCRIPT_DIR/data-collector.js" /opt/water-level-alert/
    cp "$SCRIPT_DIR/station_config.json" /opt/water-level-alert/
    cp "$SCRIPT_DIR/package.json" /opt/water-level-alert/
    
    # 设置权限
    chown waterlevel:waterlevel /opt/water-level-alert/*
    chmod 644 /opt/water-level-alert/*
    
    log "Application files copied"
}

# 安装npm依赖
install_dependencies() {
    log "Installing npm dependencies..."
    
    cd /opt/water-level-alert
    
    # 安装依赖
    npm install --production
    
    log "Dependencies installed"
}

# 安装systemd服务
install_service() {
    log "Installing systemd service..."
    
    # 复制服务文件
    cp water-level-collector.service /etc/systemd/system/
    
    # 重新加载systemd
    systemctl daemon-reload
    
    # 启用服务
    systemctl enable water-level-collector.service
    
    log "Systemd service installed and enabled"
}

# 配置防火墙
configure_firewall() {
    log "Configuring firewall..."
    
    # 检查firewalld是否运行
    if systemctl is-active --quiet firewalld; then
        # 添加端口（如果需要）
        firewall-cmd --permanent --add-port=3001/tcp
        firewall-cmd --reload
        log "Firewall configured"
    else
        warn "firewalld is not running, skipping firewall configuration"
    fi
}

# 创建日志轮转配置
setup_logrotate() {
    log "Setting up log rotation..."
    
    cat > /etc/logrotate.d/water-level-collector << EOF
/var/log/water-level-collector/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 waterlevel waterlevel
    postrotate
        systemctl reload water-level-collector.service
    endscript
}
EOF
    
    log "Log rotation configured"
}

# 启动服务
start_service() {
    log "Starting water-level-collector service..."
    
    systemctl start water-level-collector.service
    
    # 检查服务状态
    if systemctl is-active --quiet water-level-collector.service; then
        log "Service started successfully"
    else
        error "Failed to start service"
    fi
}

# 显示状态信息
show_status() {
    log "Installation completed successfully!"
    echo
    echo "Service Status:"
    systemctl status water-level-collector.service --no-pager
    echo
    echo "Useful commands:"
    echo "  Start service:   systemctl start water-level-collector.service"
    echo "  Stop service:    systemctl stop water-level-collector.service"
    echo "  Restart service: systemctl restart water-level-collector.service"
    echo "  View logs:       journalctl -u water-level-collector.service -f"
    echo "  View status:     systemctl status water-level-collector.service"
    echo
    echo "Configuration file: /opt/water-level-alert/station_config.json"
    echo "Data directory:     /opt/water-level-alert/station_data"
    echo "Logs:              journalctl -u water-level-collector.service"
}

# 主函数
main() {
    log "Starting Water Level Data Collector installation..."
    
    check_root
    check_os
    install_nodejs
    create_user
    create_directories
    copy_files
    install_dependencies
    install_service
    configure_firewall
    setup_logrotate
    start_service
    show_status
    
    log "Installation completed!"
}

# 运行主函数
main "$@" 
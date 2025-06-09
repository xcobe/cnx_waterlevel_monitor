#!/bin/bash

# Water Level Data Collector Uninstallation Script for CentOS 7.6
# 使用方法: sudo ./uninstall.sh

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

# 停止并禁用服务
stop_service() {
    log "Stopping and disabling water-level-collector service..."
    
    if systemctl is-active --quiet water-level-collector.service; then
        systemctl stop water-level-collector.service
        log "Service stopped"
    else
        log "Service was not running"
    fi
    
    if systemctl is-enabled --quiet water-level-collector.service; then
        systemctl disable water-level-collector.service
        log "Service disabled"
    else
        log "Service was not enabled"
    fi
}

# 移除systemd服务文件
remove_service() {
    log "Removing systemd service files..."
    
    if [[ -f /etc/systemd/system/water-level-collector.service ]]; then
        rm -f /etc/systemd/system/water-level-collector.service
        systemctl daemon-reload
        log "Service files removed"
    else
        log "Service files not found"
    fi
}

# 移除应用文件
remove_app_files() {
    log "Removing application files..."
    
    if [[ -d /opt/water-level-alert ]]; then
        rm -rf /opt/water-level-alert
        log "Application directory removed"
    else
        log "Application directory not found"
    fi
}

# 移除日志文件
remove_logs() {
    log "Removing log files..."
    
    if [[ -d /var/log/water-level-collector ]]; then
        rm -rf /var/log/water-level-collector
        log "Log directory removed"
    else
        log "Log directory not found"
    fi
}

# 移除日志轮转配置
remove_logrotate() {
    log "Removing logrotate configuration..."
    
    if [[ -f /etc/logrotate.d/water-level-collector ]]; then
        rm -f /etc/logrotate.d/water-level-collector
        log "Logrotate configuration removed"
    else
        log "Logrotate configuration not found"
    fi
}

# 移除用户和组
remove_user() {
    log "Removing waterlevel user and group..."
    
    # 检查是否有其他进程使用该用户
    if pgrep -u waterlevel > /dev/null 2>&1; then
        warn "Found processes running as waterlevel user. Please stop them first."
        return
    fi
    
    # 删除用户
    if getent passwd waterlevel > /dev/null; then
        userdel waterlevel
        log "waterlevel user removed"
    else
        log "waterlevel user not found"
    fi
    
    # 删除组
    if getent group waterlevel > /dev/null; then
        groupdel waterlevel
        log "waterlevel group removed"
    else
        log "waterlevel group not found"
    fi
}

# 清理防火墙规则
cleanup_firewall() {
    log "Cleaning up firewall rules..."
    
    if systemctl is-active --quiet firewalld; then
        firewall-cmd --permanent --remove-port=3001/tcp 2>/dev/null || true
        firewall-cmd --reload
        log "Firewall rules cleaned up"
    else
        log "firewalld not running, skipping firewall cleanup"
    fi
}

# 显示卸载完成信息
show_completion() {
    log "Uninstallation completed successfully!"
    echo
    echo "The following items have been removed:"
    echo "  - Systemd service: water-level-collector.service"
    echo "  - Application directory: /opt/water-level-alert"
    echo "  - Log directory: /var/log/water-level-collector"
    echo "  - Logrotate configuration"
    echo "  - waterlevel user and group"
    echo "  - Firewall rules"
    echo
    echo "Note: Node.js and npm are not removed as they may be used by other applications."
    echo "To remove Node.js, run: yum remove nodejs npm"
}

# 主函数
main() {
    log "Starting Water Level Data Collector uninstallation..."
    
    check_root
    
    # 确认卸载
    echo -e "${YELLOW}This will completely remove the Water Level Data Collector service.${NC}"
    echo -e "${YELLOW}All data in /opt/water-level-alert/station_data will be lost!${NC}"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Uninstallation cancelled"
        exit 0
    fi
    
    stop_service
    remove_service
    remove_app_files
    remove_logs
    remove_logrotate
    remove_user
    cleanup_firewall
    show_completion
    
    log "Uninstallation completed!"
}

# 运行主函数
main "$@" 
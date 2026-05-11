#!/bin/bash

echo "========================================"
echo "    团队工作日报系统 - 启动中..."
echo "========================================"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

# 安装依赖
echo ""
echo "[1/3] 正在安装依赖..."
npm install

# 创建数据目录
if [ ! -d "data" ]; then
    mkdir data
fi

echo ""
echo "[2/3] 依赖安装完成"
echo ""
echo "[3/3] 启动服务器..."
echo ""
echo "========================================"
echo ""
echo "    员工日报入口: http://localhost:3000/index.html"
echo "    管理看板入口: http://localhost:3000/admin.html"
echo ""
echo "========================================"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm start

/**
 * 团队工作日报系统 - 服务器端
 * 使用 sql.js (纯JS SQLite，无需编译)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 数据目录 - Railway持久化存储在 /data
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'diary.db');

// 全局数据库变量
let db = null;

// 初始化数据库
async function initDatabase() {
    const SQL = await initSqlJs();

    // 尝试加载现有数据库
    try {
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            console.log('✓ 已加载现有数据库');
        } else {
            db = new SQL.Database();
            console.log('✓ 已创建新数据库');
        }
    } catch (err) {
        db = new SQL.Database();
        console.log('✓ 已创建新数据库');
    }

    // 创建表
    db.run(`
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            department TEXT DEFAULT '催收部',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            report_date DATE NOT NULL,
            task_category TEXT,
            customer_name TEXT,
            customer_id TEXT,
            task_content TEXT,
            progress INTEGER DEFAULT 0,
            completion_status TEXT,
            achievement TEXT,
            difficulties TEXT,
            next_plan TEXT,
            follow_result TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id),
            UNIQUE(employee_id, report_date)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS admin_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (report_id) REFERENCES daily_reports(id)
        )
    `);

    // 初始化示例员工数据
    const result = db.exec("SELECT COUNT(*) as count FROM employees");
    const count = result.length > 0 ? result[0].values[0][0] : 0;

    if (count === 0) {
        const employees = [
            ['房航宇', '南昌人才发展主管'],
            ['曹艳斌', '太原人才发展主管'],
            ['鹿翔宇', '太原培训与人才发展主管'],
            ['韩淼', '太原培训专员'],
            ['黄婷钠', '太原培训专员'],
            ['马晋燕', '太原培训专员'],
            ['麻万鑫', '晋中培训专员'],
            ['王彦卿', '晋中培训专员']
        ];

        const stmt = db.prepare("INSERT INTO employees (name, department) VALUES (?, ?)");
        employees.forEach(emp => {
            stmt.run([emp[0], emp[1]]);
        });
        stmt.free();
        console.log('✓ 已初始化8名员工');
    }

    // 保存数据库
    saveDatabase();
}

// 保存数据库到文件
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// 辅助函数：将查询结果转为数组
function queryToArray(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

// ============ API 接口 ============

// 获取所有员工列表
app.get('/api/employees', (req, res) => {
    const result = db.exec("SELECT * FROM employees ORDER BY id");
    const employees = queryToArray(result);
    res.json({ success: true, data: employees });
});

// 添加员工
app.post('/api/employees', (req, res) => {
    const { name, department } = req.body;
    if (!name) {
        return res.json({ success: false, message: '姓名不能为空' });
    }

    try {
        db.run("INSERT INTO employees (name, department) VALUES (?, ?)", [name, department || '催收部']);
        const result = db.exec("SELECT * FROM employees WHERE id = last_insert_rowid()");
        const employee = queryToArray(result)[0];
        saveDatabase();
        io.emit('employee_added', employee);
        res.json({ success: true, data: employee });
    } catch (err) {
        res.json({ success: false, message: '员工已存在或添加失败' });
    }
});

// 提交/更新日报
app.post('/api/reports', (req, res) => {
    const {
        employee_id,
        report_date,
        task_category,
        customer_name,
        customer_id,
        task_content,
        progress,
        completion_status,
        achievement,
        difficulties,
        next_plan,
        follow_result,
        notes
    } = req.body;

    if (!employee_id || !report_date) {
        return res.json({ success: false, message: '员工ID和日期不能为空' });
    }

    try {
        // 检查是否已存在
        const existing = db.exec(`SELECT id FROM daily_reports WHERE employee_id = ${employee_id} AND report_date = '${report_date}'`);
        const today = new Date().toISOString().slice(0, 19).replace('T', ' ');

        if (existing.length > 0 && existing[0].values.length > 0) {
            // 更新
            db.run(`
                UPDATE daily_reports SET
                    task_category = ?, customer_name = ?, customer_id = ?,
                    task_content = ?, progress = ?, completion_status = ?,
                    achievement = ?, difficulties = ?, next_plan = ?,
                    follow_result = ?, notes = ?, updated_at = ?
                WHERE employee_id = ? AND report_date = ?
            `, [
                task_category || '', customer_name || '', customer_id || '',
                task_content || '', progress || 0, completion_status || '',
                achievement || '', difficulties || '', next_plan || '',
                follow_result || '', notes || '', today,
                employee_id, report_date
            ]);

            const reportResult = db.exec(`SELECT * FROM daily_reports WHERE id = ${existing[0].values[0][0]}`);
            const report = queryToArray(reportResult)[0];

            // 获取员工名称
            const empResult = db.exec(`SELECT name, department FROM employees WHERE id = ${employee_id}`);
            if (empResult.length > 0) {
                report.employee_name = empResult[0].values[0][0];
                report.department = empResult[0].values[0][1];
            }

            saveDatabase();
            io.emit('report_updated', report);
            res.json({ success: true, data: report, message: '日报已更新' });
        } else {
            // 新增
            db.run(`
                INSERT INTO daily_reports (
                    employee_id, report_date, task_category, customer_name, customer_id,
                    task_content, progress, completion_status, achievement, difficulties,
                    next_plan, follow_result, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                employee_id, report_date, task_category || '', customer_name || '',
                customer_id || '', task_content || '', progress || 0, completion_status || '',
                achievement || '', difficulties || '', next_plan || '',
                follow_result || '', notes || '', today, today
            ]);

            const reportResult = db.exec("SELECT * FROM daily_reports WHERE id = last_insert_rowid()");
            const report = queryToArray(reportResult)[0];

            // 获取员工名称
            const empResult = db.exec(`SELECT name, department FROM employees WHERE id = ${employee_id}`);
            if (empResult.length > 0) {
                report.employee_name = empResult[0].values[0][0];
                report.department = empResult[0].values[0][1];
            }

            saveDatabase();
            io.emit('report_added', report);
            res.json({ success: true, data: report, message: '日报已提交' });
        }
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '提交失败' });
    }
});

// 获取某人的日报列表
app.get('/api/reports/employee/:id', (req, res) => {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    let sql = `
        SELECT r.*, e.name as employee_name, e.department
        FROM daily_reports r
        JOIN employees e ON r.employee_id = e.id
        WHERE r.employee_id = ${id}
    `;

    if (start_date) {
        sql += ` AND r.report_date >= '${start_date}'`;
    }
    if (end_date) {
        sql += ` AND r.report_date <= '${end_date}'`;
    }

    sql += ' ORDER BY r.report_date DESC';

    const result = db.exec(sql);
    const reports = queryToArray(result);
    res.json({ success: true, data: reports });
});

// 获取所有日报
app.get('/api/reports/all', (req, res) => {
    const { date, department, keyword } = req.query;

    let sql = `
        SELECT r.*, e.name as employee_name, e.department
        FROM daily_reports r
        JOIN employees e ON r.employee_id = e.id
        WHERE 1=1
    `;

    if (date) {
        sql += ` AND r.report_date = '${date}'`;
    }
    if (department) {
        sql += ` AND e.department = '${department}'`;
    }
    if (keyword) {
        sql += ` AND (e.name LIKE '%${keyword}%' OR r.task_content LIKE '%${keyword}%' OR r.difficulties LIKE '%${keyword}%')`;
    }

    sql += ' ORDER BY r.report_date DESC, e.name ASC';

    const result = db.exec(sql);
    const reports = queryToArray(result);
    res.json({ success: true, data: reports });
});

// 获取统计数据
app.get('/api/stats', (req, res) => {
    const { start_date, end_date } = req.query;

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 部门统计
    const deptResult = db.exec(`
        SELECT e.department,
               COUNT(DISTINCT e.id) as total_employees,
               COUNT(r.id) as report_count,
               AVG(r.progress) as avg_progress
        FROM employees e
        LEFT JOIN daily_reports r ON e.id = r.employee_id
            ${start_date ? `AND r.report_date >= '${start_date}'` : ''}
            ${end_date ? `AND r.report_date <= '${end_date}'` : ''}
        GROUP BY e.department
    `);

    // 每日趋势
    const trendResult = db.exec(`
        SELECT report_date, COUNT(*) as count, AVG(progress) as avg_progress
        FROM daily_reports
        WHERE 1=1
        ${start_date ? `AND report_date >= '${start_date}'` : ''}
        ${end_date ? `AND report_date <= '${end_date}'` : ''}
        GROUP BY report_date
        ORDER BY report_date DESC
        LIMIT 30
    `);

    // 任务分类
    const categoryResult = db.exec(`
        SELECT task_category, COUNT(*) as count, AVG(progress) as avg_progress
        FROM daily_reports
        WHERE task_category IS NOT NULL AND task_category != ''
        ${start_date ? `AND report_date >= '${start_date}'` : ''}
        ${end_date ? `AND report_date <= '${end_date}'` : ''}
        GROUP BY task_category
    `);

    // 完成情况
    const completionResult = db.exec(`
        SELECT completion_status, COUNT(*) as count
        FROM daily_reports
        WHERE completion_status IS NOT NULL AND completion_status != ''
        ${start_date ? `AND report_date >= '${start_date}'` : ''}
        ${end_date ? `AND report_date <= '${end_date}'` : ''}
        GROUP BY completion_status
    `);

    // 今日统计
    const totalEmployees = db.exec("SELECT COUNT(*) as count FROM employees");
    const todaySubmitted = db.exec(`SELECT COUNT(DISTINCT employee_id) as count FROM daily_reports WHERE report_date = '${today}'`);

    res.json({
        success: true,
        data: {
            deptStats: queryToArray(deptResult),
            dailyTrend: queryToArray(trendResult),
            categoryStats: queryToArray(categoryResult),
            completionStats: queryToArray(completionResult),
            todayStats: {
                submitted: todaySubmitted.length > 0 ? todaySubmitted[0].values[0][0] : 0,
                total: totalEmployees.length > 0 ? totalEmployees[0].values[0][0] : 0,
                rate: 0
            }
        }
    });
});

// 添加批注
app.post('/api/reports/:id/notes', (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    try {
        db.run("INSERT INTO admin_notes (report_id, content) VALUES (?, ?)", [id, content]);
        const result = db.exec("SELECT * FROM admin_notes WHERE id = last_insert_rowid()");
        const note = queryToArray(result)[0];
        saveDatabase();
        io.emit('note_added', { report_id: id, note });
        res.json({ success: true, data: note });
    } catch (err) {
        res.json({ success: false, message: '添加批注失败' });
    }
});

// 获取批注
app.get('/api/reports/:id/notes', (req, res) => {
    const { id } = req.params;
    const result = db.exec(`SELECT * FROM admin_notes WHERE report_id = ${id} ORDER BY created_at DESC`);
    const notes = queryToArray(result);
    res.json({ success: true, data: notes });
});

// 删除员工
app.delete('/api/employees/:id', (req, res) => {
    const { id } = req.params;
    try {
        db.run(`DELETE FROM daily_reports WHERE employee_id = ${id}`);
        db.run(`DELETE FROM employees WHERE id = ${id}`);
        saveDatabase();
        io.emit('employee_deleted', { id });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: '删除失败' });
    }
});

// ============ Socket.IO 实时通信 ============
io.on('connection', (socket) => {
    console.log('✓ 客户端连接:', socket.id);

    socket.on('submit_report', (data) => {
        io.emit('report_updated', data);
    });

    socket.on('disconnect', () => {
        console.log('✗ 客户端断开:', socket.id);
    });
});

// ============ 启动服务器 ============
const PORT = process.env.PORT || 3000;

async function start() {
    await initDatabase();

    server.listen(PORT, () => {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║        团队工作日报系统 - 服务器已启动                      ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  本地访问:  http://localhost:${PORT}                           ║`);
        console.log('║  员工日报:  http://localhost:3000/index.html                 ║');
        console.log('║  管理看板:  http://localhost:3000/admin.html                ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
    });
}

start();

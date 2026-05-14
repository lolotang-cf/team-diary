/**
 * 团队工作日报系统 - 服务器端
 * 使用 Railway Postgres (持久化存储)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

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

// PostgreSQL 连接池 - Railway自动注入DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// 初始化数据库
async function initDatabase() {
    const client = await pool.connect();
    try {
        // 创建员工表
        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                department TEXT DEFAULT '催收部',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建日报表
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(employee_id, report_date)
            )
        `);

        // 创建批注表
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_notes (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 初始化示例员工数据
        const countRes = await client.query("SELECT COUNT(*) as count FROM employees");
        const count = parseInt(countRes.rows[0].count);

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

            for (const emp of employees) {
                await client.query(
                    "INSERT INTO employees (name, department) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
                    emp
                );
            }
            console.log('已初始化8名员工');
        }

        console.log('数据库初始化完成');
    } finally {
        client.release();
    }
}

// ============ API 接口 ============

// 获取所有员工列表
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM employees ORDER BY id");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '查询失败' });
    }
});

// 添加员工
app.post('/api/employees', async (req, res) => {
    const { name, department } = req.body;
    if (!name) {
        return res.json({ success: false, message: '姓名不能为空' });
    }

    try {
        const result = await pool.query(
            "INSERT INTO employees (name, department) VALUES ($1, $2) RETURNING *",
            [name, department || '催收部']
        );
        const employee = result.rows[0];
        io.emit('employee_added', employee);
        res.json({ success: true, data: employee });
    } catch (err) {
        res.json({ success: false, message: '员工已存在或添加失败' });
    }
});

// 提交/更新日报
app.post('/api/reports', async (req, res) => {
    const {
        employee_id, report_date, task_category, customer_name, customer_id,
        task_content, progress, completion_status, achievement, difficulties,
        next_plan, follow_result, notes
    } = req.body;

    if (!employee_id || !report_date) {
        return res.json({ success: false, message: '员工ID和日期不能为空' });
    }

    try {
        // 检查是否已存在
        const existing = await pool.query(
            "SELECT id FROM daily_reports WHERE employee_id = $1 AND report_date = $2",
            [employee_id, report_date]
        );

        let report;
        if (existing.rows.length > 0) {
            // 更新
            const result = await pool.query(`
                UPDATE daily_reports SET
                    task_category = $1, customer_name = $2, customer_id = $3,
                    task_content = $4, progress = $5, completion_status = $6,
                    achievement = $7, difficulties = $8, next_plan = $9,
                    follow_result = $10, notes = $11, updated_at = CURRENT_TIMESTAMP
                WHERE employee_id = $12 AND report_date = $13
                RETURNING *
            `, [
                task_category || '', customer_name || '', customer_id || '',
                task_content || '', progress || 0, completion_status || '',
                achievement || '', difficulties || '', next_plan || '',
                follow_result || '', notes || '',
                employee_id, report_date
            ]);
            report = result.rows[0];
            io.emit('report_updated', report);
        } else {
            // 新增
            const result = await pool.query(`
                INSERT INTO daily_reports (
                    employee_id, report_date, task_category, customer_name, customer_id,
                    task_content, progress, completion_status, achievement, difficulties,
                    next_plan, follow_result, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
            `, [
                employee_id, report_date, task_category || '', customer_name || '',
                customer_id || '', task_content || '', progress || 0, completion_status || '',
                achievement || '', difficulties || '', next_plan || '',
                follow_result || '', notes || ''
            ]);
            report = result.rows[0];
            io.emit('report_added', report);
        }

        // 获取员工名称
        const empResult = await pool.query(
            "SELECT name, department FROM employees WHERE id = $1",
            [employee_id]
        );
        if (empResult.rows.length > 0) {
            report.employee_name = empResult.rows[0].name;
            report.department = empResult.rows[0].department;
        }

        res.json({ success: true, data: report });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '提交失败' });
    }
});

// 获取某人的日报列表
app.get('/api/reports/employee/:id', async (req, res) => {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    let sql = `
        SELECT r.*, e.name as employee_name, e.department
        FROM daily_reports r
        JOIN employees e ON r.employee_id = e.id
        WHERE r.employee_id = $1
    `;
    const params = [id];
    let paramIdx = 2;

    if (start_date) {
        sql += ` AND r.report_date >= $${paramIdx++}`;
        params.push(start_date);
    }
    if (end_date) {
        sql += ` AND r.report_date <= $${paramIdx++}`;
        params.push(end_date);
    }

    sql += ' ORDER BY r.report_date DESC';

    try {
        const result = await pool.query(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '查询失败' });
    }
});

// 获取所有日报
app.get('/api/reports/all', async (req, res) => {
    const { date, department, keyword } = req.query;

    let sql = `
        SELECT r.*, e.name as employee_name, e.department
        FROM daily_reports r
        JOIN employees e ON r.employee_id = e.id
        WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (date) {
        sql += ` AND r.report_date = $${paramIdx++}`;
        params.push(date);
    }
    if (department) {
        sql += ` AND e.department = $${paramIdx++}`;
        params.push(department);
    }
    if (keyword) {
        sql += ` AND (e.name ILIKE $${paramIdx} OR r.task_content ILIKE $${paramIdx} OR r.difficulties ILIKE $${paramIdx})`;
        params.push(`%${keyword}%`);
        paramIdx++;
    }

    sql += ' ORDER BY r.report_date DESC, e.name ASC';

    try {
        const result = await pool.query(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: '查询失败' });
    }
});

// 获取统计数据
app.get('/api/stats', async (req, res) => {
    const { start_date, end_date } = req.query;
    const today = new Date().toISOString().split('T')[0];

    try {
        const params = [];
        let idx = 1;

        // 部门统计
        let deptSql = `
            SELECT e.department,
                   COUNT(DISTINCT e.id) as total_employees,
                   COUNT(r.id) as report_count,
                   COALESCE(AVG(r.progress), 0) as avg_progress
            FROM employees e
            LEFT JOIN daily_reports r ON e.id = r.employee_id
        `;
        const deptConditions = [];
        if (start_date) {
            deptConditions.push(`r.report_date >= $${idx++}`);
            params.push(start_date);
        }
        if (end_date) {
            deptConditions.push(`r.report_date <= $${idx++}`);
            params.push(end_date);
        }
        if (deptConditions.length > 0) {
            deptSql += ' WHERE ' + deptConditions.join(' AND ');
        }
        deptSql += ' GROUP BY e.department';
        const deptResult = await pool.query(deptSql, params);

        // 每日趋势
        idx = 1;
        const trendParams = [];
        let trendSql = `SELECT report_date, COUNT(*) as count, COALESCE(AVG(progress), 0) as avg_progress FROM daily_reports WHERE 1=1`;
        if (start_date) {
            trendSql += ` AND report_date >= $${idx++}`;
            trendParams.push(start_date);
        }
        if (end_date) {
            trendSql += ` AND report_date <= $${idx++}`;
            trendParams.push(end_date);
        }
        trendSql += ' GROUP BY report_date ORDER BY report_date DESC LIMIT 30';
        const trendResult = await pool.query(trendSql, trendParams);

        // 任务分类
        idx = 1;
        const catParams = [];
        let catSql = `SELECT task_category, COUNT(*) as count, COALESCE(AVG(progress), 0) as avg_progress FROM daily_reports WHERE task_category IS NOT NULL AND task_category != ''`;
        if (start_date) {
            catSql += ` AND report_date >= $${idx++}`;
            catParams.push(start_date);
        }
        if (end_date) {
            catSql += ` AND report_date <= $${idx++}`;
            catParams.push(end_date);
        }
        catSql += ' GROUP BY task_category';
        const categoryResult = await pool.query(catSql, catParams);

        // 完成情况
        idx = 1;
        const compParams = [];
        let compSql = `SELECT completion_status, COUNT(*) as count FROM daily_reports WHERE completion_status IS NOT NULL AND completion_status != ''`;
        if (start_date) {
            compSql += ` AND report_date >= $${idx++}`;
            compParams.push(start_date);
        }
        if (end_date) {
            compSql += ` AND report_date <= $${idx++}`;
            compParams.push(end_date);
        }
        compSql += ' GROUP BY completion_status';
        const completionResult = await pool.query(compSql, compParams);

        // 今日统计
        const totalEmployees = await pool.query("SELECT COUNT(*) as count FROM employees");
        const todaySubmitted = await pool.query(
            "SELECT COUNT(DISTINCT employee_id) as count FROM daily_reports WHERE report_date = $1",
            [today]
        );

        const total = parseInt(totalEmployees.rows[0].count);
        const submitted = parseInt(todaySubmitted.rows[0].count);

        res.json({
            success: true,
            data: {
                deptStats: deptResult.rows,
                dailyTrend: trendResult.rows,
                categoryStats: categoryResult.rows,
                completionStats: completionResult.rows,
                todayStats: {
                    submitted: submitted,
                    total: total,
                    rate: total > 0 ? Math.round((submitted / total) * 100) : 0
                }
            }
        });
    } catch (err) {
        console.error('Stats API error:', err);
        res.json({ success: false, message: '统计失败: ' + err.message, error: err.message });
    }
});

// 添加批注
app.post('/api/reports/:id/notes', async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;

    try {
        const result = await pool.query(
            "INSERT INTO admin_notes (report_id, content) VALUES ($1, $2) RETURNING *",
            [id, content]
        );
        const note = result.rows[0];
        io.emit('note_added', { report_id: id, note });
        res.json({ success: true, data: note });
    } catch (err) {
        res.json({ success: false, message: '添加批注失败' });
    }
});

// 获取批注
app.get('/api/reports/:id/notes', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM admin_notes WHERE report_id = $1 ORDER BY created_at DESC",
            [id]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.json({ success: false, message: '查询失败' });
    }
});

// 删除员工
app.delete('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM employees WHERE id = $1", [id]);
        io.emit('employee_deleted', { id });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: '删除失败' });
    }
});

// ============ Socket.IO 实时通信 ============
io.on('connection', (socket) => {
    console.log('客户端连接:', socket.id);

    socket.on('submit_report', (data) => {
        io.emit('report_updated', data);
    });

    socket.on('disconnect', () => {
        console.log('客户端断开:', socket.id);
    });
});

// ============ 启动服务器 ============
const PORT = process.env.PORT || 3000;

async function start() {
    await initDatabase();

    server.listen(PORT, () => {
        console.log('');
        console.log('团队工作日报系统 - 服务器已启动');
        console.log(`本地访问: http://localhost:${PORT}`);
        console.log('');
    });
}

start();

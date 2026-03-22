// SQLite使用示例 - 如何查询和存储数据

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');  // 创建/打开数据库文件

// ==========================================
// 第1步：创建表（初始化）
// ==========================================
db.run(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bvid TEXT NOT NULL,
    title TEXT,
    author TEXT,
    subtitle_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bvid (bvid)
)`);

// ==========================================
// 第2步：插入数据（保存记录）
// ==========================================
function saveHistory(bvid, title, author, subtitleCount) {
    const sql = 'INSERT INTO history (bvid, title, author, subtitle_count) VALUES (?, ?, ?, ?)';

    db.run(sql, [bvid, title, author, subtitleCount], function(err) {
        if (err) {
            console.error('保存失败:', err);
        } else {
            console.log('✅ 保存成功，记录ID:', this.lastID);
        }
    });
}

// 使用示例
saveHistory('BV1XkAne1Ew1', '视频标题', 'UP主名字', 3);

// ==========================================
// 第3步：查询数据
// ==========================================

// 查询1：获取最近50条记录
function getRecentHistory() {
    const sql = 'SELECT * FROM history ORDER BY created_at DESC LIMIT 50';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('查询失败:', err);
        } else {
            console.log('查询结果:', rows);
            // rows = [
            //   { id: 1, bvid: 'BV123', title: '标题1', ... },
            //   { id: 2, bvid: 'BV456', title: '标题2', ... }
            // ]
        }
    });
}

// 查询2：搜索特定视频
function searchByBvid(bvid) {
    const sql = 'SELECT * FROM history WHERE bvid = ?';

    db.get(sql, [bvid], (err, row) => {
        if (err) {
            console.error('查询失败:', err);
        } else if (row) {
            console.log('找到记录:', row);
        } else {
            console.log('没有找到记录');
        }
    });
}

// 查询3：统计总数
function getTotalCount() {
    const sql = 'SELECT COUNT(*) as total FROM history';

    db.get(sql, [], (err, row) => {
        if (err) {
            console.error('查询失败:', err);
        } else {
            console.log('总记录数:', row.total);
        }
    });
}

// 查询4：按UP主分组统计
function getStatsByAuthor() {
    const sql = `
        SELECT author, COUNT(*) as count
        FROM history
        GROUP BY author
        ORDER BY count DESC
        LIMIT 10
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('查询失败:', err);
        } else {
            console.log('UP主统计:', rows);
            // [
            //   { author: '某UP主', count: 15 },
            //   { author: '另一个UP主', count: 10 }
            // ]
        }
    });
}

// ==========================================
// 第4步：删除数据
// ==========================================

// 删除特定记录
function deleteHistory(id) {
    const sql = 'DELETE FROM history WHERE id = ?';

    db.run(sql, [id], function(err) {
        if (err) {
            console.error('删除失败:', err);
        } else {
            console.log('✅ 删除成功，影响行数:', this.changes);
        }
    });
}

// 删除30天前的旧记录
function cleanOldHistory() {
    const sql = "DELETE FROM history WHERE created_at < datetime('now', '-30 days')";

    db.run(sql, function(err) {
        if (err) {
            console.error('清理失败:', err);
        } else {
            console.log('✅ 清理完成，删除了', this.changes, '条旧记录');
        }
    });
}

// ==========================================
// 第5步：更新数据
// ==========================================

function updateTitle(id, newTitle) {
    const sql = 'UPDATE history SET title = ? WHERE id = ?';

    db.run(sql, [newTitle, id], function(err) {
        if (err) {
            console.error('更新失败:', err);
        } else {
            console.log('✅ 更新成功，影响行数:', this.changes);
        }
    });
}

// ==========================================
// 常用SQL语句总结
// ==========================================

/*
增（INSERT）：
  INSERT INTO 表名 (字段1, 字段2) VALUES (值1, 值2)

删（DELETE）：
  DELETE FROM 表名 WHERE 条件

改（UPDATE）：
  UPDATE 表名 SET 字段1=值1 WHERE 条件

查（SELECT）：
  SELECT * FROM 表名 WHERE 条件 ORDER BY 字段 LIMIT 10

聚合查询：
  SELECT COUNT(*), AVG(字段), SUM(字段) FROM 表名

分组统计：
  SELECT 字段, COUNT(*) FROM 表名 GROUP BY 字段
*/

// 关闭数据库连接（程序退出时）
process.on('exit', () => {
    db.close();
});

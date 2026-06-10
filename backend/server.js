import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import getDb from './db.js';
import { startScheduler, triggerScreenshotNow } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

app.get('/api/urls', async (req, res) => {
  const db = await getDb();
  const urls = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM screenshots s WHERE s.url_id = u.id) as screenshot_count,
      (SELECT health_status FROM health_checks h WHERE h.url_id = u.id ORDER BY h.created_at DESC LIMIT 1) as last_health_status,
      (SELECT overall_health_score FROM health_checks h WHERE h.url_id = u.id ORDER BY h.created_at DESC LIMIT 1) as last_health_score,
      (SELECT error_summary FROM health_checks h WHERE h.url_id = u.id ORDER BY h.created_at DESC LIMIT 1) as last_error_summary,
      (SELECT created_at FROM health_checks h WHERE h.url_id = u.id ORDER BY h.created_at DESC LIMIT 1) as last_health_check_at,
      (SELECT COUNT(*) FROM alerts a WHERE a.url_id = u.id AND a.is_resolved = 0) as active_alert_count
    FROM urls u
    ORDER BY u.created_at DESC
  `).all();
  res.json(urls);
});

app.post('/api/urls', async (req, res) => {
  const { url, name, frequency = 'daily' } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL和名称必填' });
  }

  const validFrequencies = ['hourly', 'daily', 'weekly', 'monthly'];
  if (!validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: '无效的频率' });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO urls (url, name, frequency) VALUES (?, ?, ?)');
    const result = stmt.run(url, name, frequency);

    const newUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUrl);
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      res.status(400).json({ error: '该URL已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const screenshots = db.prepare('SELECT file_path FROM screenshots WHERE url_id = ?').all(id);
  screenshots.forEach(s => {
    if (fs.existsSync(s.file_path)) {
      fs.unlinkSync(s.file_path);
      const dir = path.dirname(s.file_path);
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (e) {}
    }
  });

  db.prepare('DELETE FROM screenshots WHERE url_id = ?').run(id);
  const stmt = db.prepare('DELETE FROM urls WHERE id = ?');
  stmt.run(id);
  res.json({ success: true });
});

app.put('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const { name, frequency, status } = req.body;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const finalName = name || existing.name;
  const finalFrequency = frequency || existing.frequency;
  const finalStatus = status || existing.status;

  const stmt = db.prepare('UPDATE urls SET name = ?, frequency = ?, status = ? WHERE id = ?');
  stmt.run(finalName, finalFrequency, finalStatus, id);

  const updated = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  res.json(updated);
});

app.get('/api/urls/:id/screenshots', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshots = db.prepare(`
    SELECT * FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
  `).all(id);
  res.json(screenshots);
});

app.get('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  res.json(screenshot);
});

app.delete('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }

  if (fs.existsSync(screenshot.file_path)) {
    fs.unlinkSync(screenshot.file_path);
  }

  db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/urls/:id/screenshot', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await triggerScreenshotNow(parseInt(id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }
  res.json(url);
});

app.get('/api/urls/:id/health-checks', async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;
  const db = await getDb();

  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const checks = db.prepare(`
    SELECT h.*, s.file_path as screenshot_path, s.file_name as screenshot_name
    FROM health_checks h
    LEFT JOIN screenshots s ON h.screenshot_id = s.id
    WHERE h.url_id = ?
    ORDER BY h.created_at DESC
    LIMIT ?
  `).all(id, parseInt(limit));

  res.json(checks);
});

app.get('/api/health-checks/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const check = db.prepare(`
    SELECT h.*, s.file_path as screenshot_path, s.file_name as screenshot_name
    FROM health_checks h
    LEFT JOIN screenshots s ON h.screenshot_id = s.id
    WHERE h.id = ?
  `).get(id);

  if (!check) {
    return res.status(404).json({ error: '健康检查记录不存在' });
  }

  const consoleErrors = db.prepare(`
    SELECT * FROM console_errors WHERE health_check_id = ? ORDER BY id
  `).all(id);

  const resourceErrors = db.prepare(`
    SELECT * FROM resource_errors WHERE health_check_id = ? ORDER BY id
  `).all(id);

  res.json({
    ...check,
    console_errors: consoleErrors,
    resource_errors: resourceErrors
  });
});

app.get('/api/urls/:id/health-trend', async (req, res) => {
  const { id } = req.params;
  const { days = 7 } = req.query;
  const db = await getDb();

  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const trend = db.prepare(`
    SELECT id, health_status, overall_health_score, page_load_time,
           first_contentful_paint_time, resource_load_success_rate,
           js_error_count, created_at
    FROM health_checks
    WHERE url_id = ? AND created_at >= datetime('now', ? || ' days')
    ORDER BY created_at ASC
  `).all(id, `-${parseInt(days)}`);

  res.json(trend);
});

app.get('/api/alerts', async (req, res) => {
  const { resolved = 'false', limit = 50 } = req.query;
  const db = await getDb();

  const isResolved = resolved === 'true' ? 1 : 0;
  const alerts = db.prepare(`
    SELECT a.*, u.name as url_name, u.url as url_address
    FROM alerts a
    JOIN urls u ON a.url_id = u.id
    WHERE a.is_resolved = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(isResolved, parseInt(limit));

  res.json(alerts);
});

app.get('/api/urls/:id/alerts', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const alerts = db.prepare(`
    SELECT * FROM alerts
    WHERE url_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id);

  res.json(alerts);
});

app.put('/api/alerts/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  if (!alert) {
    return res.status(404).json({ error: '告警不存在' });
  }

  db.prepare(`
    UPDATE alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);

  const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  res.json(updated);
});

app.get('/api/dashboard/summary', async (req, res) => {
  const db = await getDb();

  const totalUrls = db.prepare('SELECT COUNT(*) as count FROM urls').get().count;
  const totalScreenshots = db.prepare('SELECT COUNT(*) as count FROM screenshots').get().count;

  const latestStatuses = db.prepare(`
    SELECT health_status, COUNT(*) as count
    FROM (
      SELECT h.url_id, h.health_status
      FROM health_checks h
      INNER JOIN (
        SELECT url_id, MAX(created_at) as max_created
        FROM health_checks
        GROUP BY url_id
      ) latest ON h.url_id = latest.url_id AND h.created_at = latest.max_created
    )
    GROUP BY health_status
  `).all();

  const statusMap = { healthy: 0, warning: 0, critical: 0 };
  latestStatuses.forEach(s => { statusMap[s.health_status] = s.count; });

  const activeAlerts = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE is_resolved = 0').get().count;

  const avgHealthScore = db.prepare(`
    SELECT AVG(overall_health_score) as avg
    FROM (
      SELECT h.url_id, h.overall_health_score
      FROM health_checks h
      INNER JOIN (
        SELECT url_id, MAX(created_at) as max_created
        FROM health_checks
        GROUP BY url_id
      ) latest ON h.url_id = latest.url_id AND h.created_at = latest.max_created
    )
  `).get().avg;

  res.json({
    total_urls: totalUrls,
    total_screenshots: totalScreenshots,
    health_status_counts: statusMap,
    active_alerts: activeAlerts,
    avg_health_score: avgHealthScore ? Math.round(avgHealthScore) : null
  });
});

app.listen(PORT, async () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
  await getDb();
  startScheduler();
});

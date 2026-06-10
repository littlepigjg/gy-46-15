import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getDb from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    let executablePath = null;
    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    browser = await puppeteer.launch(launchOptions);
  }
  return browser;
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

function calculateHealthStatus(score) {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'warning';
  return 'critical';
}

function calculateHealthScore(metrics) {
  let score = 100;

  if (metrics.httpStatusCode && (metrics.httpStatusCode >= 400 || metrics.httpStatusCode < 200)) {
    score -= 50;
  }
  if (metrics.pageLoadStatus === 'timeout' || metrics.pageLoadStatus === 'error') {
    score -= 60;
  }
  if (metrics.pageLoadTime > 10000) score -= 15;
  else if (metrics.pageLoadTime > 5000) score -= 8;
  else if (metrics.pageLoadTime > 3000) score -= 4;

  if (metrics.resourceLoadSuccessRate < 0.5) score -= 20;
  else if (metrics.resourceLoadSuccessRate < 0.8) score -= 10;
  else if (metrics.resourceLoadSuccessRate < 0.95) score -= 3;

  score -= Math.min(metrics.jsErrorCount * 5, 25);
  score -= Math.min(metrics.consoleErrorCount * 2, 10);
  score -= Math.min(metrics.consoleWarnCount * 1, 5);

  if (metrics.firstContentfulPaintTime > 4000) score -= 10;
  else if (metrics.firstContentfulPaintTime > 2500) score -= 5;

  return Math.max(0, score);
}

function generateAlertSuggestion(healthCheck, consoleErrors, resourceErrors) {
  const suggestions = [];

  if (healthCheck.http_status_code >= 500) {
    suggestions.push('服务器返回5xx错误，建议检查后端服务是否正常运行、日志是否有异常');
  } else if (healthCheck.http_status_code >= 400 && healthCheck.http_status_code < 500) {
    suggestions.push('页面返回4xx错误，请检查URL是否正确、权限配置是否正常');
  }

  if (healthCheck.page_load_time > 10000) {
    suggestions.push('页面加载时间超过10秒，建议：启用CDN加速、压缩静态资源、优化图片大小、减少HTTP请求');
  }

  if (healthCheck.resource_load_success_rate < 0.8) {
    suggestions.push('大量资源加载失败，请检查：资源路径是否正确、服务器是否可访问、跨域配置是否正确');
  }

  if (healthCheck.js_error_count > 0 && consoleErrors.length > 0) {
    const errorTypes = [...new Set(consoleErrors.map(e => e.type))];
    if (errorTypes.includes('ReferenceError')) {
      suggestions.push('存在引用错误，建议检查变量是否正确定义、脚本加载顺序是否正确');
    }
    if (errorTypes.includes('TypeError')) {
      suggestions.push('存在类型错误，建议检查数据类型是否正确、API返回值是否符合预期');
    }
    suggestions.push('建议查看详细错误堆栈定位具体问题位置');
  }

  if (healthCheck.first_contentful_paint_time > 4000) {
    suggestions.push('首屏渲染时间过长，建议：首屏资源懒加载、使用骨架屏、优化关键渲染路径');
  }

  if (suggestions.length === 0) {
    suggestions.push('请查看详细错误信息进一步定位问题');
  }

  return suggestions.join('；');
}

export async function takeScreenshot(urlRecord) {
  const { id, url, name } = urlRecord;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const urlDir = path.join(SCREENSHOTS_DIR, sanitizeFilename(name || url), dateStr);
  if (!fs.existsSync(urlDir)) {
    fs.mkdirSync(urlDir, { recursive: true });
  }

  const fileName = `${timeStr}.png`;
  const filePath = path.join(urlDir, fileName);

  const metrics = {
    pageLoadStatus: 'success',
    httpStatusCode: null,
    pageLoadTime: null,
    domContentLoadedTime: null,
    firstPaintTime: null,
    firstContentfulPaintTime: null,
    resourceLoadSuccessCount: 0,
    resourceLoadTotalCount: 0,
    jsErrorCount: 0,
    consoleWarnCount: 0,
    consoleErrorCount: 0,
  };

  const consoleErrors = [];
  const resourceErrors = [];

  let page = null;
  let screenshotSaved = false;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');

    page.on('response', (response) => {
      const req = response.request();
      if (req.resourceType() !== 'document') {
        metrics.resourceLoadTotalCount++;
        if (response.ok()) {
          metrics.resourceLoadSuccessCount++;
        } else {
          resourceErrors.push({
            resource_url: response.url(),
            resource_type: req.resourceType(),
            error_message: response.statusText() || 'Resource load failed',
            status_code: response.status()
          });
        }
      } else {
        metrics.httpStatusCode = response.status();
      }
    });

    page.on('requestfailed', (request) => {
      if (request.resourceType() !== 'document') {
        metrics.resourceLoadTotalCount++;
        resourceErrors.push({
          resource_url: request.url(),
          resource_type: request.resourceType(),
          error_message: request.failure()?.errorText || 'Request failed',
          status_code: null
        });
      }
    });

    page.on('pageerror', (error) => {
      metrics.jsErrorCount++;
      let errorType = 'Error';
      const match = error.message.match(/^(\w+Error?):/);
      if (match) errorType = match[1];

      consoleErrors.push({
        type: errorType,
        message: error.message,
        stack_trace: error.stack,
        source: error.stack?.split('\n')[1]?.trim() || null,
        line_number: null,
        column_number: null
      });
    });

    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') {
        metrics.consoleErrorCount++;
        consoleErrors.push({
          type: 'ConsoleError',
          message: msg.text(),
          stack_trace: msg.stackTrace()?.map(s => `${s.url}:${s.lineNumber}:${s.columnNumber}`).join('\n') || null,
          source: msg.stackTrace()?.[0]?.url || null,
          line_number: msg.stackTrace()?.[0]?.lineNumber || null,
          column_number: msg.stackTrace()?.[0]?.columnNumber || null
        });
      } else if (type === 'warning' || type === 'warn') {
        metrics.consoleWarnCount++;
      }
    });

    const navigationStart = Date.now();
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      metrics.pageLoadTime = Date.now() - navigationStart;
    } catch (navError) {
      if (navError.name === 'TimeoutError') {
        metrics.pageLoadStatus = 'timeout';
      } else {
        metrics.pageLoadStatus = 'error';
      }
      consoleErrors.push({
        type: navError.name || 'NavigationError',
        message: navError.message,
        stack_trace: navError.stack,
        source: null,
        line_number: null,
        column_number: null
      });
    }

    try {
      const timingMetrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        let firstPaint = null;
        let firstContentfulPaint = null;
        paint.forEach(p => {
          if (p.name === 'first-paint') firstPaint = p.startTime;
          if (p.name === 'first-contentful-paint') firstContentfulPaint = p.startTime;
        });
        return {
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
          firstPaint: firstPaint,
          firstContentfulPaint: firstContentfulPaint
        };
      });
      metrics.domContentLoadedTime = timingMetrics.domContentLoaded ? Math.round(timingMetrics.domContentLoaded) : null;
      metrics.firstPaintTime = timingMetrics.firstPaint ? Math.round(timingMetrics.firstPaint) : null;
      metrics.firstContentfulPaintTime = timingMetrics.firstContentfulPaint ? Math.round(timingMetrics.firstContentfulPaint) : null;
    } catch (e) {}

    try {
      await page.screenshot({ path: filePath, fullPage: true });
      screenshotSaved = true;
    } catch (screenshotErr) {
      console.error('截图保存失败:', screenshotErr.message);
    }

    const healthScore = calculateHealthScore(metrics);
    const healthStatus = calculateHealthStatus(healthScore);
    const resourceLoadSuccessRate = metrics.resourceLoadTotalCount > 0
      ? metrics.resourceLoadSuccessCount / metrics.resourceLoadTotalCount
      : 1;

    const errorSummaryParts = [];
    if (metrics.pageLoadStatus !== 'success') errorSummaryParts.push(`页面加载:${metrics.pageLoadStatus}`);
    if (metrics.httpStatusCode && metrics.httpStatusCode !== 200) errorSummaryParts.push(`HTTP:${metrics.httpStatusCode}`);
    if (metrics.jsErrorCount > 0) errorSummaryParts.push(`JS错误:${metrics.jsErrorCount}`);
    if (resourceErrors.length > 0) errorSummaryParts.push(`资源失败:${resourceErrors.length}`);
    const errorSummary = errorSummaryParts.length > 0 ? errorSummaryParts.join('，') : null;

    const db = await getDb();

    let screenshotId = null;
    if (screenshotSaved) {
      const insertStmt = db.prepare(`
        INSERT INTO screenshots (url_id, file_path, file_name, width, height)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(id, filePath, fileName, 1920, 1080);
      screenshotId = result.lastInsertRowid;
    }

    const insertHealthStmt = db.prepare(`
      INSERT INTO health_checks (
        url_id, screenshot_id, page_load_status, http_status_code,
        page_load_time, dom_content_loaded_time, first_paint_time,
        first_contentful_paint_time, resource_load_success_count,
        resource_load_total_count, resource_load_success_rate,
        js_error_count, console_warn_count, console_error_count,
        overall_health_score, health_status, error_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const healthResult = insertHealthStmt.run(
      id, screenshotId, metrics.pageLoadStatus, metrics.httpStatusCode,
      metrics.pageLoadTime, metrics.domContentLoadedTime, metrics.firstPaintTime,
      metrics.firstContentfulPaintTime, metrics.resourceLoadSuccessCount,
      metrics.resourceLoadTotalCount, resourceLoadSuccessRate,
      metrics.jsErrorCount, metrics.consoleWarnCount, metrics.consoleErrorCount,
      healthScore, healthStatus, errorSummary
    );
    const healthCheckId = healthResult.lastInsertRowid;

    if (screenshotId) {
      db.prepare('UPDATE screenshots SET health_check_id = ? WHERE id = ?').run(healthCheckId, screenshotId);
    }

    const insertConsoleStmt = db.prepare(`
      INSERT INTO console_errors (health_check_id, url_id, type, message, stack_trace, source, line_number, column_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    consoleErrors.forEach(e => {
      insertConsoleStmt.run(healthCheckId, id, e.type, e.message, e.stack_trace, e.source, e.line_number, e.column_number);
    });

    const insertResourceStmt = db.prepare(`
      INSERT INTO resource_errors (health_check_id, url_id, resource_url, resource_type, error_message, status_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    resourceErrors.forEach(e => {
      insertResourceStmt.run(healthCheckId, id, e.resource_url, e.resource_type, e.error_message, e.status_code);
    });

    const updateStmt = db.prepare(`
      UPDATE urls SET last_screenshot_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    updateStmt.run(id);

    if (healthStatus !== 'healthy') {
      const recentChecks = db.prepare(`
        SELECT health_status FROM health_checks
        WHERE url_id = ? ORDER BY created_at DESC LIMIT 3
      `).all(id);

      const consecutiveBad = recentChecks.every(c => c.health_status !== 'healthy');
      if (consecutiveBad && recentChecks.length >= 2) {
        const existingAlert = db.prepare(`
          SELECT id FROM alerts WHERE url_id = ? AND is_resolved = 0 ORDER BY created_at DESC LIMIT 1
        `).get(id);

        if (!existingAlert) {
          const suggestion = generateAlertSuggestion(
            {
              http_status_code: metrics.httpStatusCode,
              page_load_time: metrics.pageLoadTime,
              resource_load_success_rate: resourceLoadSuccessRate,
              js_error_count: metrics.jsErrorCount,
              first_contentful_paint_time: metrics.firstContentfulPaintTime
            },
            consoleErrors,
            resourceErrors
          );

          const severity = healthStatus === 'critical' ? 'high' : 'medium';
          const alertTitle = healthStatus === 'critical' ? '页面严重异常' : '页面健康状态警告';
          const description = errorSummary || '页面健康检查发现异常，需要关注';

          db.prepare(`
            INSERT INTO alerts (url_id, alert_type, severity, title, description, suggestion)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, 'health', severity, alertTitle, description, suggestion);
        }
      }
    } else {
      const unresolvedAlert = db.prepare(`
        SELECT id FROM alerts WHERE url_id = ? AND is_resolved = 0 ORDER BY created_at DESC LIMIT 1
      `).get(id);
      if (unresolvedAlert) {
        db.prepare(`
          UPDATE alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(unresolvedAlert.id);
      }
    }

    return {
      id: screenshotId,
      health_check_id: healthCheckId,
      file_path: screenshotSaved ? filePath : null,
      file_name: screenshotSaved ? fileName : null,
      created_at: now.toISOString(),
      health_check: {
        id: healthCheckId,
        health_status: healthStatus,
        overall_health_score: healthScore,
        ...metrics,
        resource_load_success_rate: resourceLoadSuccessRate,
        error_summary: errorSummary,
        console_errors_count: consoleErrors.length,
        resource_errors_count: resourceErrors.length
      }
    };
  } catch (error) {
    console.error(`截图失败 [${url}]:`, error.message);

    const db = await getDb();
    const healthStatus = 'critical';
    const errorSummary = `系统错误:${error.message.substring(0, 100)}`;

    const insertHealthStmt = db.prepare(`
      INSERT INTO health_checks (
        url_id, screenshot_id, page_load_status, health_status,
        overall_health_score, error_summary
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertHealthStmt.run(id, null, 'fatal', healthStatus, 0, errorSummary);

    throw error;
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

export { SCREENSHOTS_DIR };

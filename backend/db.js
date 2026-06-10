import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data.db');

let dbInstance = null;

function wrapStatement(stmt, db) {
  return {
    run(...params) {
      stmt.bind(params);
      while (stmt.step()) {}
      const lastId = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0];
      const changes = db.exec('SELECT changes() AS c')[0]?.values[0][0];
      stmt.reset();
      stmt.free();
      return { lastInsertRowid: lastId, changes: changes };
    },
    get(...params) {
      stmt.bind(params);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.reset();
      stmt.free();
      return result;
    },
    all(...params) {
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.reset();
      stmt.free();
      return results;
    }
  };
}

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const modPath = path.dirname(new URL(import.meta.resolve('sql.js')).pathname.replace(/^\/([A-Z]:)/, '$1'));
      const decodedPath = decodeURIComponent(modPath);
      return path.join(decodedPath, file);
    }
  });

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_screenshot_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      health_check_id INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
      FOREIGN KEY (health_check_id) REFERENCES health_checks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      screenshot_id INTEGER,
      page_load_status TEXT NOT NULL,
      http_status_code INTEGER,
      page_load_time INTEGER,
      dom_content_loaded_time INTEGER,
      first_paint_time INTEGER,
      first_contentful_paint_time INTEGER,
      resource_load_success_count INTEGER DEFAULT 0,
      resource_load_total_count INTEGER DEFAULT 0,
      resource_load_success_rate REAL DEFAULT 0,
      js_error_count INTEGER DEFAULT 0,
      console_warn_count INTEGER DEFAULT 0,
      console_error_count INTEGER DEFAULT 0,
      overall_health_score INTEGER DEFAULT 100,
      health_status TEXT NOT NULL DEFAULT 'healthy',
      error_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS console_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      health_check_id INTEGER NOT NULL,
      url_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT,
      stack_trace TEXT,
      source TEXT,
      line_number INTEGER,
      column_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (health_check_id) REFERENCES health_checks(id) ON DELETE CASCADE,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      health_check_id INTEGER NOT NULL,
      url_id INTEGER NOT NULL,
      resource_url TEXT,
      resource_type TEXT,
      error_message TEXT,
      status_code INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (health_check_id) REFERENCES health_checks(id) ON DELETE CASCADE,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      suggestion TEXT,
      is_resolved INTEGER DEFAULT 0,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_screenshots_url_id ON screenshots(url_id);
    CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_screenshots_health_check_id ON screenshots(health_check_id);
    CREATE INDEX IF NOT EXISTS idx_health_checks_url_id ON health_checks(url_id);
    CREATE INDEX IF NOT EXISTS idx_health_checks_created_at ON health_checks(created_at);
    CREATE INDEX IF NOT EXISTS idx_health_checks_health_status ON health_checks(health_status);
    CREATE INDEX IF NOT EXISTS idx_console_errors_health_check_id ON console_errors(health_check_id);
    CREATE INDEX IF NOT EXISTS idx_resource_errors_health_check_id ON resource_errors(health_check_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_url_id ON alerts(url_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_is_resolved ON alerts(is_resolved);
  `);

  const wrappedDb = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return wrapStatement(stmt, db);
    },
    exec(sql) {
      db.exec(sql);
    },
    pragma() {},
    save() {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    }
  };

  const origPrepare = wrappedDb.prepare;
  wrappedDb.prepare = function(sql) {
    const wrapped = origPrepare.call(this, sql);
    const origRun = wrapped.run;
    wrapped.run = function(...args) {
      const ret = origRun.call(this, ...args);
      wrappedDb.save();
      return ret;
    };
    return wrapped;
  };

  return wrappedDb;
}

export default async function getDb() {
  if (!dbInstance) {
    dbInstance = await initDb();
  }
  return dbInstance;
}

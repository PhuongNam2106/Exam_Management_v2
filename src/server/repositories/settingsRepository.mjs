export function createSettingsRepository(db) {
  return {
    get(key) {
      return db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key) || null;
    },
    set(key, value) {
      db.prepare(`
        INSERT INTO settings(key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(key, value);
      return this.get(key);
    }
  };
}

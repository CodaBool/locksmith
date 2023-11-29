CREATE TABLE IF NOT EXISTS itch (module TEXT, purchases INTEGER, keys INTEGER, views INTEGER);

INSERT OR IGNORE INTO itch (module, purchases, keys, views) VALUES ('terminal', 1, 1, 1)

SELECT * FROM itch

UPDATE manifests SET data = 'ok' WHERE module = 'terminal'
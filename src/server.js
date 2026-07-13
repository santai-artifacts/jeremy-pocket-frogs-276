const express = require('express');
const path = require('path');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database (Node's built-in SQLite — no native module needed)
const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../frogs.db');
const db = new DatabaseSync(dbPath);
console.log('Connected to SQLite database');

// Small helpers mirroring the old async API so the routes below stay tidy.
const run = (sql, params = []) => {
  const info = db.prepare(sql).run(...params);
  return { id: Number(info.lastInsertRowid), changes: Number(info.changes) };
};
const get = (sql, params = []) => db.prepare(sql).get(...params);
const all = (sql, params = []) => db.prepare(sql).all(...params);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS frogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    species TEXT DEFAULT 'Green Tree Frog',
    color TEXT DEFAULT 'green',
    experience INTEGER DEFAULT 0,
    happiness INTEGER DEFAULT 100,
    energy INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS habitats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wallpaper TEXT DEFAULT 'forest',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS habitat_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habitat_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_name TEXT NOT NULL,
    x INTEGER DEFAULT 50,
    y INTEGER DEFAULT 50,
    FOREIGN KEY(habitat_id) REFERENCES habitats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS frog_habitat (
    frog_id INTEGER PRIMARY KEY,
    habitat_id INTEGER NOT NULL,
    FOREIGN KEY(frog_id) REFERENCES frogs(id) ON DELETE CASCADE,
    FOREIGN KEY(habitat_id) REFERENCES habitats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS breeding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent1_id INTEGER NOT NULL,
    parent2_id INTEGER NOT NULL,
    baby_id INTEGER,
    status TEXT DEFAULT 'incubating',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hatch_at DATETIME,
    FOREIGN KEY(parent1_id) REFERENCES frogs(id),
    FOREIGN KEY(parent2_id) REFERENCES frogs(id),
    FOREIGN KEY(baby_id) REFERENCES frogs(id)
  );
`);

// API Routes
app.get('/api/frogs', (req, res) => {
  try {
    res.json(all('SELECT * FROM frogs ORDER BY created_at DESC'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/frogs', (req, res) => {
  try {
    const { name, species = 'Green Tree Frog' } = req.body;

    const speciesInfo = {
      'Green Tree Frog': 'green',
      'Poison Dart Frog': 'blue',
      'Bullfrogs': 'brown',
      'Tree Frog': 'pink',
      'White Tree Frog': 'white'
    };

    const color = speciesInfo[species] || 'green';

    const result = run(
      'INSERT INTO frogs (name, species, color) VALUES (?, ?, ?)',
      [name, species, color]
    );

    const habitatResult = run(
      'INSERT INTO habitats (name) VALUES (?)',
      [`${name}'s Home`]
    );

    run(
      'INSERT INTO frog_habitat (frog_id, habitat_id) VALUES (?, ?)',
      [result.id, habitatResult.id]
    );

    const frog = get('SELECT * FROM frogs WHERE id = ?', [result.id]);
    res.status(201).json(frog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/frogs/:id', (req, res) => {
  try {
    const frog = get('SELECT * FROM frogs WHERE id = ?', [req.params.id]);
    res.json(frog || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/frogs/:id', (req, res) => {
  try {
    const { name, level, experience, happiness, energy } = req.body;
    run(
      'UPDATE frogs SET name = ?, level = ?, experience = ?, happiness = ?, energy = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, level, experience, happiness, energy, req.params.id]
    );
    const frog = get('SELECT * FROM frogs WHERE id = ?', [req.params.id]);
    res.json(frog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/frogs/:id', (req, res) => {
  try {
    run('DELETE FROM frogs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/habitats/:frogId', (req, res) => {
  try {
    const habitat = get(
      `SELECT h.* FROM habitats h
       JOIN frog_habitat fh ON h.id = fh.habitat_id
       WHERE fh.frog_id = ?`,
      [req.params.frogId]
    );
    res.json(habitat || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/habitats/:habitatId', (req, res) => {
  try {
    const { wallpaper } = req.body;
    run('UPDATE habitats SET wallpaper = ? WHERE id = ?', [wallpaper, req.params.habitatId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/habitats/:habitatId/items', (req, res) => {
  try {
    const items = all('SELECT * FROM habitat_items WHERE habitat_id = ?', [req.params.habitatId]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/habitats/:habitatId/items', (req, res) => {
  try {
    const { item_type, item_name, x = 50, y = 50 } = req.body;
    const result = run(
      'INSERT INTO habitat_items (habitat_id, item_type, item_name, x, y) VALUES (?, ?, ?, ?, ?)',
      [req.params.habitatId, item_type, item_name, x, y]
    );
    const item = get('SELECT * FROM habitat_items WHERE id = ?', [result.id]);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/habitats/:habitatId/items/:itemId', (req, res) => {
  try {
    run('DELETE FROM habitat_items WHERE id = ?', [req.params.itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/breeding', (req, res) => {
  try {
    const { parent1_id, parent2_id } = req.body;

    const parent1 = get('SELECT * FROM frogs WHERE id = ?', [parent1_id]);
    const parent2 = get('SELECT * FROM frogs WHERE id = ?', [parent2_id]);

    if (!parent1 || !parent2 || parent1.level < 10 || parent2.level < 10) {
      return res.status(400).json({ error: 'Both parents must be level 10+' });
    }

    const hatchAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = run(
      'INSERT INTO breeding (parent1_id, parent2_id, hatch_at) VALUES (?, ?, ?)',
      [parent1_id, parent2_id, hatchAt]
    );

    const breeding = get('SELECT * FROM breeding WHERE id = ?', [result.id]);
    res.status(201).json(breeding);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/breeding', (req, res) => {
  try {
    const breedings = all(
      `SELECT b.*, f1.name as parent1_name, f2.name as parent2_name, f3.name as baby_name
       FROM breeding b
       LEFT JOIN frogs f1 ON b.parent1_id = f1.id
       LEFT JOIN frogs f2 ON b.parent2_id = f2.id
       LEFT JOIN frogs f3 ON b.baby_id = f3.id
       ORDER BY b.created_at DESC`
    );
    res.json(breedings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/breeding/:id/hatch', (req, res) => {
  try {
    const breeding = get('SELECT * FROM breeding WHERE id = ?', [req.params.id]);

    if (!breeding) {
      return res.status(404).json({ error: 'Breeding not found' });
    }

    if (breeding.baby_id) {
      return res.status(400).json({ error: 'Already hatched' });
    }

    const parent1 = get('SELECT * FROM frogs WHERE id = ?', [breeding.parent1_id]);
    const parent2 = get('SELECT * FROM frogs WHERE id = ?', [breeding.parent2_id]);

    const colors = [parent1.color, parent2.color, 'purple', 'orange', 'yellow'];
    const species = [parent1.species, parent2.species];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomSpecies = species[Math.floor(Math.random() * species.length)];
    const babyName = `${parent1.name} Jr.`;

    const babyResult = run(
      'INSERT INTO frogs (name, species, color, level, experience, happiness, energy) VALUES (?, ?, ?, 1, 0, 100, 100)',
      [babyName, randomSpecies, randomColor]
    );

    run(
      'UPDATE breeding SET baby_id = ?, status = ? WHERE id = ?',
      [babyResult.id, 'hatched', req.params.id]
    );

    const baby = get('SELECT * FROM frogs WHERE id = ?', [babyResult.id]);
    res.status(201).json(baby);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for any unknown routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🐸 Pocket Frogs server running on port ${port}`);
});

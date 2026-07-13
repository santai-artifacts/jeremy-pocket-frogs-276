import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import Database from "bun:sqlite";

const app = new Hono();

// Initialize database
const dbPath = process.env.DATABASE_URL || "frogs.db";
const db = new Database(dbPath);

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

// Serve static files
app.use("/*", serveStatic({ root: "./public" }));

// API Routes
app.get("/api/frogs", (c) => {
  const frogs = db.query("SELECT * FROM frogs ORDER BY created_at DESC").all();
  return c.json(frogs);
});

app.post("/api/frogs", async (c) => {
  const body = await c.req.json();
  const { name, species = "Green Tree Frog", color = "green" } = body;

  const frogSpecies = [
    { name: "Green Tree Frog", color: "green" },
    { name: "Poison Dart Frog", color: "blue" },
    { name: "Bullfrogs", color: "brown" },
    { name: "Tree Frog", color: "pink" },
    { name: "White Tree Frog", color: "white" },
  ];

  const selectedSpecies =
    frogSpecies.find((s) => s.name === species) || frogSpecies[0];

  const stmt = db.prepare(
    `INSERT INTO frogs (name, species, color) VALUES (?, ?, ?) RETURNING *`
  );
  const frog = stmt.get(name, selectedSpecies.name, selectedSpecies.color);

  // Create habitat for the frog
  const habitatStmt = db.prepare(
    `INSERT INTO habitats (name) VALUES (?) RETURNING id`
  );
  const habitat = habitatStmt.get(`${name}'s Home`);

  db.prepare(`INSERT INTO frog_habitat (frog_id, habitat_id) VALUES (?, ?)`).run(
    frog.id,
    habitat.id
  );

  return c.json(frog, 201);
});

app.get("/api/frogs/:id", (c) => {
  const id = c.req.param("id");
  const frog = db.query("SELECT * FROM frogs WHERE id = ?").get(id);
  return c.json(frog);
});

app.put("/api/frogs/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, level, experience, happiness, energy } = body;

  const stmt = db.prepare(
    `UPDATE frogs SET name = ?, level = ?, experience = ?, happiness = ?, energy = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`
  );
  const frog = stmt.get(
    name,
    level,
    experience,
    happiness,
    energy,
    id
  );

  return c.json(frog);
});

app.delete("/api/frogs/:id", (c) => {
  const id = c.req.param("id");
  db.prepare(`DELETE FROM frogs WHERE id = ?`).run(id);
  return c.json({ success: true });
});

app.get("/api/habitats/:frogId", (c) => {
  const frogId = c.req.param("frogId");
  const habitat = db
    .query(
      `SELECT h.* FROM habitats h
       JOIN frog_habitat fh ON h.id = fh.habitat_id
       WHERE fh.frog_id = ?`
    )
    .get(frogId);
  return c.json(habitat || {});
});

app.put("/api/habitats/:habitatId", async (c) => {
  const habitatId = c.req.param("habitatId");
  const body = await c.req.json();
  const { wallpaper } = body;

  const stmt = db.prepare(`UPDATE habitats SET wallpaper = ? WHERE id = ?`);
  stmt.run(wallpaper, habitatId);

  return c.json({ success: true });
});

app.get("/api/habitats/:habitatId/items", (c) => {
  const habitatId = c.req.param("habitatId");
  const items = db
    .query("SELECT * FROM habitat_items WHERE habitat_id = ?")
    .all(habitatId);
  return c.json(items);
});

app.post("/api/habitats/:habitatId/items", async (c) => {
  const habitatId = c.req.param("habitatId");
  const body = await c.req.json();
  const { item_type, item_name, x = 50, y = 50 } = body;

  const stmt = db.prepare(
    `INSERT INTO habitat_items (habitat_id, item_type, item_name, x, y) VALUES (?, ?, ?, ?, ?) RETURNING *`
  );
  const item = stmt.get(habitatId, item_type, item_name, x, y);

  return c.json(item, 201);
});

app.delete("/api/habitats/:habitatId/items/:itemId", (c) => {
  const itemId = c.req.param("itemId");
  db.prepare(`DELETE FROM habitat_items WHERE id = ?`).run(itemId);
  return c.json({ success: true });
});

app.post("/api/breeding", async (c) => {
  const body = await c.req.json();
  const { parent1_id, parent2_id } = body;

  const parent1 = db.query("SELECT * FROM frogs WHERE id = ?").get(parent1_id);
  const parent2 = db.query("SELECT * FROM frogs WHERE id = ?").get(parent2_id);

  if (!parent1 || !parent2 || parent1.level < 10 || parent2.level < 10) {
    return c.json({ error: "Both parents must be level 10+" }, 400);
  }

  const hatchAt = new Date(Date.now() + 5 * 60 * 1000);
  const stmt = db.prepare(
    `INSERT INTO breeding (parent1_id, parent2_id, hatch_at) VALUES (?, ?, ?) RETURNING *`
  );
  const breeding = stmt.get(parent1_id, parent2_id, hatchAt.toISOString());

  return c.json(breeding, 201);
});

app.get("/api/breeding", (c) => {
  const breedings = db
    .query(
      `SELECT b.*, f1.name as parent1_name, f2.name as parent2_name, f3.name as baby_name
       FROM breeding b
       LEFT JOIN frogs f1 ON b.parent1_id = f1.id
       LEFT JOIN frogs f2 ON b.parent2_id = f2.id
       LEFT JOIN frogs f3 ON b.baby_id = f3.id
       ORDER BY b.created_at DESC`
    )
    .all();
  return c.json(breedings);
});

app.post("/api/breeding/:id/hatch", async (c) => {
  const id = c.req.param("id");
  const breeding = db
    .query("SELECT * FROM breeding WHERE id = ?")
    .get(id);

  if (!breeding) {
    return c.json({ error: "Breeding not found" }, 404);
  }

  if (breeding.baby_id) {
    return c.json({ error: "Already hatched" }, 400);
  }

  const parent1 = db
    .query("SELECT * FROM frogs WHERE id = ?")
    .get(breeding.parent1_id);
  const parent2 = db
    .query("SELECT * FROM frogs WHERE id = ?")
    .get(breeding.parent2_id);

  const colors = [parent1.color, parent2.color, "purple", "orange", "yellow"];
  const species = [parent1.species, parent2.species];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const randomSpecies = species[Math.floor(Math.random() * species.length)];

  const babyName = `${parent1.name} Jr.`;

  const babyStmt = db.prepare(
    `INSERT INTO frogs (name, species, color, level, experience, happiness, energy)
     VALUES (?, ?, ?, 1, 0, 100, 100) RETURNING *`
  );
  const baby = babyStmt.get(babyName, randomSpecies, randomColor);

  const updateStmt = db.prepare(
    `UPDATE breeding SET baby_id = ?, status = 'hatched' WHERE id = ?`
  );
  updateStmt.run(baby.id, id);

  return c.json(baby, 201);
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};

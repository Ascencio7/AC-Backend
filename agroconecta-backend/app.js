import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 conexión PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:A_ascencio_21%24@db.artanswcrxwpcymcrsey.supabase.co:5432/postgres',
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// 🔐 LOGIN
app.get('/usuarios/login', async (req, res) => {
  const { correo, password } = req.query;

  console.log("➡️ REQUEST:");
  console.log("correo:", correo);
  console.log("password:", password);

  try {
    const result = await pool.query(
      `SELECT usuario_id, nombre, correo, "Password_hash"
       FROM usuarios
       WHERE correo = $1`,
      [correo]
    );

    console.log("📦 DB RESULT:", result.rows);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuario no existe" });
    }

    const user = result.rows[0];

    const dbPassword = user["Password_hash"];

    console.log("🔑 DB password:", dbPassword);
    console.log("🔑 APP password:", password);

    if (dbPassword === password) {
      return res.json({
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        correo: user.correo
      });
    }

    return res.status(401).json({ error: "Credenciales incorrectas" });

  } catch (error) {
    console.error("❌ Error en login:", error.message);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// 🚀 servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
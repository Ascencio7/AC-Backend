import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl:{
    require: true,
    rejectUnauthorized: false
  }
});

// LOGIN
app.get('/usuarios/login', async (req, res) => {
  const { correo, password } = req.query;

  console.log("➡️ REQUEST:", correo, password);

  try {
    const result = await pool.query(
      `SELECT "Usuario_Id", "Nombre", "Correo", "Password_hash"
       FROM "Usuarios"
       WHERE "Correo" = $1`,
      [correo]
    );

    console.log("📦 DB RESULT:", result.rows);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuario no existe" });
    }

    const user = result.rows[0];

    // 🔥 usar minúsculas
    console.log("🔑 DB password:", user.password_hash);
    console.log("🔑 APP password:", password);

    if (user.password_hash.trim() === password.trim()) {
      return res.json({
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        correo: user.correo
      });
    }

    return res.status(401).json({ error: "Credenciales incorrectas" });

  } catch (error) {
    console.error("❌ ERROR BACKEND:", error);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
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

// 🔐 LOGIN (DEBUG VERSION)
app.get('/usuarios/login', async (req, res) => {
  const { correo, password } = req.query;

  if (!correo || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    // 🔍 primero buscamos SOLO por correo
    const result = await pool.query(
      `SELECT usuario_id, nombre, correo, password_hash 
       FROM usuarios 
       WHERE correo = $1`,
      [correo.trim()]
    );

    console.log("📦 Usuario encontrado:", result.rows);

    // ❌ si no existe el usuario
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no existe' });
    }

    const user = result.rows[0];

    console.log("🔑 Password DB:", user.password_hash);
    console.log("🔑 Password APP:", password);

    // 🔐 comparación manual
    if (user.password_hash === password.trim()) {
      return res.json({
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        correo: user.correo
      });
    } else {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

  } catch (error) {
    console.error("❌ Error en login:", error.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 🚀 servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
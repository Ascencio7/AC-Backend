const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 conexión PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:A_ascencio_21%24@db.artanswcrxwpcymcrsey.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});


// 🔐 LOGIN
app.get('/usuarios/login', async (req, res) => {
  const { correo, password } = req.query;

  // ✅ Validación básica
  if (!correo || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  console.log("Intento de login:");
  console.log("Correo:", correo);
  console.log("Password:", password);

  try {
    const result = await pool.query(
      `SELECT usuario_id, nombre, correo 
       FROM usuarios 
       WHERE correo = $1 AND password_hash = $2`,
      [correo, password]
    );

    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(401).json({ error: 'Credenciales incorrectas' });
    }

  } catch (error) {
    console.error("Error en login:", error.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 🚀 servidor accesible desde Android
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
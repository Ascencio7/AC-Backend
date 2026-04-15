import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// 🔗 Conexión a Supabase usando DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ Verificar conexión al iniciar
pool.connect()
  .then(client => {
    console.log("✅ Conectado a Supabase");
    client.release();
  })
  .catch(err => {
    console.error("❌ Error conectando a Supabase:", err);
  });

// Ruta base
app.get('/', (req, res) => {
  res.send('API funcionando 🚀');
});

// 🔐 LOGIN
app.get('/usuarios/login', async (req, res) => {
  const { correo, password } = req.query;

  try {
    const result = await pool.query(
      `SELECT "Usuario_Id", "Nombre", "Correo", "Password_hash"
       FROM "Usuarios"
       WHERE "Correo" = $1`,
      [correo]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuario no existe" });
    }

    const user = result.rows[0];

    // ⚠️ Comparación simple (temporal)
    if (user["Password_hash"]?.trim() === password?.trim()) {
      return res.json({
        usuario_id: user["Usuario_Id"],
        nombre: user["Nombre"],
        correo: user["Correo"]
      });
    } else {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

  } catch (error) {
    console.error("❌ ERROR BACKEND:", error.message);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// 🚀 Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
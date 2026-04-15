import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// conexión PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres.artanswcrxwpcymcrsey:A_ascencio_21%24@aws-1-us-east-2.pooler.supabase.com:6543/postgres',

  ssl: {
    require: true,
    rejectUnauthorized: false
  },
  family:4
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

    console.log("DB password:", user.Password_hash);

    if (user.Password_hash === password) {
      return res.json({
        usuario_id: user.Usuario_Id,
        nombre: user.Nombre,
        correo: user.Correo
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
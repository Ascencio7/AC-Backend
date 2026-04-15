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

    if (user && user["Password_has"] == password){
      return res.json({
        usuarioId: user["Usuario_Id"],
        nombre: user["Nombre"],
        correo: user["Correo"],
      });
    }else{
      return res.status(401).json({error: "Credenciales incorrectas"});
    }

    }
  catch (error) {
    console.error("❌ Error en login:", error.message);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// 🚀 servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
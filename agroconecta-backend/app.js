import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;

const app = express();

app.use(cors());
app.use(express.json());

// 🔗 Conexión a Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ Verificar conexión
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
  return res.status(200).json({ mensaje: 'API funcionando 🚀' });
});


// 🔐 LOGIN (CORREGIDO)
app.post('/login', async (req, res) => {

  const { correo, password } = req.body;

  // 🔍 Validación básica
  if (!correo || !password) {
    return res.status(200).json({
      success: false,
      message: "Datos incompletos"
    });
  }

  try {

    const result = await pool.query(
      `SELECT 
          u.usuario_id, 
          u.nombre, 
          u.correo, 
          u.password_hash,
          r.nombre AS rol
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.usuario_id = ur.usuario_id
       LEFT JOIN roles r ON ur.rol_id = r.rol_id
       WHERE u.correo = $1 AND u.estado = true
       LIMIT 1`,
      [correo]
    );

    // ❌ Usuario no existe
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Usuario no existe"
      });
    }

    const user = result.rows[0];

    // ⚠️ Comparación simple (luego puedes usar bcrypt)
    if (user.password_hash?.trim() === password?.trim()) {

      // ✅ LOGIN CORRECTO
      return res.status(200).json({
        success: true,
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        rol: user.rol || "CLIENTE"
      });

    } else {

      // ❌ Password incorrecto
      return res.status(200).json({
        success: false,
        message: "Credenciales incorrectas"
      });
    }

  } catch (error) {
    console.error("❌ ERROR BACKEND:", error.message);

    return res.status(200).json({
      success: false,
      message: "Error en el servidor"
    });
  }
});


// 🚀 Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
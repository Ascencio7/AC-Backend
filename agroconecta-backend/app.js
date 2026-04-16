import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;

const app = express();

// =========================
// 🔥 MIDDLEWARES
// =========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// 🔗 CONEXIÓN SUPABASE
// =========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =========================
// ✅ CHECK DB CONNECTION
// =========================
pool.connect()
  .then(client => {
    console.log("✅ Conectado a Supabase");
    client.release();
  })
  .catch(err => {
    console.error("❌ Error conectando a Supabase:", err);
  });

// =========================
// 🏠 RUTA BASE
// =========================
app.get('/', (req, res) => {
  res.status(200).json({ mensaje: 'API funcionando 🚀' });
});

// =========================
// 🔐 LOGIN
// =========================
app.post('/login', async (req, res) => {

  console.log("📥 LOGIN BODY:", req.body);

  const { correo, password } = req.body;

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

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Usuario no existe"
      });
    }

    const user = result.rows[0];

    const dbPassword = user.password_hash ? user.password_hash.trim() : "";
    const inputPassword = password ? password.trim() : "";

    if (dbPassword === inputPassword) {

      return res.status(200).json({
        success: true,
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        rol: user.rol || "CLIENTE"
      });

    } else {

      return res.status(200).json({
        success: false,
        message: "Credenciales incorrectas"
      });
    }

  } catch (error) {

    console.error("❌ LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error en el servidor"
    });
  }
});

// =========================
// 📋 LISTAR USUARIOS
// =========================
app.get('/usuarios', async (req, res) => {

  try {

    const result = await pool.query(
      `SELECT 
        usuario_id,
        nombre,
        correo,
        telefono,
        estado
      FROM usuarios
      WHERE estado = true
      ORDER BY usuario_id DESC`
    );

    return res.status(200).json(result.rows);

  } catch (error) {

    console.error("❌ ERROR LISTAR:", error);

    return res.status(500).json({
      error: "Error al obtener usuarios"
    });
  }
});

// =========================
// ✏️ ACTUALIZAR USUARIO
// =========================
app.put('/usuarios/:id', async (req, res) => {

  const { id } = req.params;
  const { nombre, correo, telefono, estado } = req.body;

  if (!nombre || !correo) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos"
    });
  }

  try {

    await pool.query(
      `UPDATE usuarios
       SET nombre = $1,
           correo = $2,
           telefono = $3,
           estado = $4
       WHERE usuario_id = $5`,
      [
        nombre,
        correo,
        telefono || null,
        estado ?? true,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Usuario actualizado"
    });

  } catch (error) {

    console.error("❌ ERROR UPDATE:", error);

    return res.status(500).json({
      success: false,
      message: "Error al actualizar usuario"
    });
  }
});

// =========================
// 🗑️ ELIMINAR (LÓGICO)
// =========================
app.delete('/usuarios/:id', async (req, res) => {

  const { id } = req.params;

  try {

    const result = await pool.query(
      `UPDATE usuarios
       SET estado = false
       WHERE usuario_id = $1
       RETURNING usuario_id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Usuario eliminado"
    });

  } catch (error) {

    console.error("❌ ERROR DELETE:", error);

    return res.status(500).json({
      success: false,
      message: "Error al eliminar usuario"
    });
  }
});

// =========================
// 🚀 INICIAR SERVIDOR
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});
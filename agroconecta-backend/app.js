import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;

const app = express();

// Medios de comunicacion de la API
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexion a Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Confirmacion de conexion a Supabase
pool.connect()
  .then(client => {
    console.log("✅ Conectado a Supabase");
    client.release();
  })
  .catch(err => {
    console.error("❌ Error conectando a Supabase:", err);
  });

// Ruta base de la API para pruebas
app.get('/', (req, res) => {
  res.status(200).json({ mensaje: 'API funcionando 🚀' });
});

// Iniciar Sesion
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
          r.rol_id,
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

    const passwordCheck = await pool.query(
      `SELECT usuario_id
      FROM usuarios
      WHERE correo = $1
      AND password_hash = crypt($2, password_hash)`,
      [correo, password]
    );

    if (passwordCheck.rows.length > 0){
      return res.status(200).json({
        success: true,
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        correo: user.correo,
        rol_id: user.rol_id,
        rol: user.rol
      });
    }else{
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

// Listar los usuarios registrados activos
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
      ORDER BY usuario_id DESC`
    );

    return res.status(200).json(result.rows);

  } catch (error) {

    console.error("ERROR LISTAR: ", error);
    return res.status(500).json({error: "Error al obtener los usuarios"});
  }
});

// Actualizar los datos del usuario
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

// Eliminar logicamente el usuario, pasando su estado a false
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

// Agrear un nuevo usuario
app.post('/usuarios', async (req, res) => {

  const { nombre, correo, password, telefono, rol_id } = req.body;

  if (!nombre || !correo || !password || !rol_id) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos"
    });
  }

  try {

    // Validar correo existente
    const existe = await pool.query(
      `SELECT 1
      FROM usuarios
      WHERE correo = $1`,
      [correo]
    );

    if (existe.rowCount > 0){
      return res.status(400).json({
        success: false,
        code: "EMAIL_EXISTS",
        message: "El correo ingresado ya está registrado"
      });
    }

    // 1. Crear usuario
    const userResult = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, telefono)
      VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
      RETURNING usuario_id`,
      [nombre, correo, password, telefono || null]
    );

    const usuario_id = userResult.rows[0].usuario_id;

    // 2. Asignar rol
    await pool.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id)
       VALUES ($1, $2)`,
      [usuario_id, rol_id]
    );

    return res.status(200).json({
      success: true,
      message: "Usuario creado correctamente"
    });

  } catch (error) {

    console.error("❌ ERROR CREATE USER:", error);

    return res.status(500).json({
      success: false,
      message: "Error al crear usuario"
    });
  }
});

// Listar los roles para que aparezcan en el select de Android
app.get('/roles', async (req, res) => {

  try {

    const result = await pool.query(
      `SELECT rol_id, nombre FROM roles ORDER BY rol_id`
    );

    return res.status(200).json(result.rows);

  } catch (error) {

    console.error("❌ ERROR ROLES:", error);

    return res.status(500).json({
      success: false,
      message: "Error al obtener roles"
    });
  }
});

// Listar categorías para el selector de Android
app.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query('SELECT categoria_id, nombre FROM categorias ORDER BY nombre ASC');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR CATEGORIAS:", error);
    return res.status(500).json({ error: "Error al obtener categorías" });
  }
});

// Listar productos activos
app.get('/productos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.nombre as nombre_categoria 
       FROM productos p 
       LEFT JOIN categorias c ON p.categoria_id = c.categoria_id 
       WHERE p.estado = true 
       ORDER BY p.producto_id ASC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR PRODUCTOS:", error);
    return res.status(500).json({ error: "Error al obtener productos" });
  }
});

// Crear producto
app.post('/productos', async (req, res) => {
  const { usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO productos (usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE PRODUCT:", error);
    return res.status(500).json({ error: "Error al crear producto" });
  }
});

// Actualizar producto (incluyendo borrado lógico si estado es false)
app.put('/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { categoria_id, nombre, descripcion, precio, existencia, estado, imagen } = req.body;
  try {
    await pool.query(
      `UPDATE productos 
       SET categoria_id = $1, nombre = $2, descripcion = $3, precio = $4, existencia = $5, estado = $6, imagen = $7
       WHERE producto_id = $8`,
      [categoria_id, nombre, descripcion, precio, existencia, estado ?? true, imagen || null, id]
    );
    return res.status(200).json({ success: true, message: "Producto actualizado" });
  } catch (error) {
    console.error("❌ ERROR UPDATE PRODUCT:", error);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// RUTA ACTUALIZADA: Listar usuarios con su información de ROL
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
          u.usuario_id,
          u.nombre,
          u.correo,
          u.telefono,
          u.estado,
          u.fecha_registro,
          r.nombre AS nombre_rol,
          r.rol_id
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.usuario_id = ur.usuario_id
       LEFT JOIN roles r ON ur.rol_id = r.rol_id
       ORDER BY u.usuario_id ASC`
    );

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error("❌ ERROR LISTAR USUARIOS:", error);
    return res.status(500).json({ error: "Error al obtener los usuarios" });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto", PORT);
});
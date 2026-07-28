import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexion a Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(client => { console.log("✅ Conectado a Supabase"); client.release(); })
  .catch(err => { console.error("❌ Error conectando a Supabase:", err); });

// Ruta base
app.get('/', (req, res) => {
  res.status(200).json({ mensaje: 'API funcionando 🚀' });
});



// EndpointS DE AgroConecta


// AUTENTICACIÓN
app.post('/login', async (req, res) => {
  console.log("📥 LOGIN BODY:", req.body);
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(200).json({ success: false, message: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `SELECT 
          u.usuario_id, u.nombre, u.correo, u.telefono, u.foto_perfil,
          u.password_hash, r.rol_id, r.nombre AS rol
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.usuario_id = ur.usuario_id
       LEFT JOIN roles r ON ur.rol_id = r.rol_id
       WHERE u.correo = $1 AND u.estado = true
       LIMIT 1`,
      [correo]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ success: false, message: "Usuario no existe" });
    }

    const user = result.rows[0];

    const passwordCheck = await pool.query(
      `SELECT usuario_id FROM usuarios
       WHERE correo = $1 AND password_hash = crypt($2, password_hash)`,
      [correo, password]
    );

    if (passwordCheck.rows.length > 0) {
      return res.status(200).json({
        success: true,
        usuario_id: user.usuario_id,
        nombre: user.nombre,
        correo: user.correo,
        telefono: user.telefono || null,
        foto_perfil: user.foto_perfil || null,
        rol_id: user.rol_id,
        rol: user.rol
      });
    } else {
      return res.status(200).json({ success: false, message: "Credenciales incorrectas" });
    }

  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);
    return res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});


// USUARIOS

// Listar usuarios (incluye foto_perfil)
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.usuario_id, u.nombre, u.correo, u.telefono, u.estado,
        u.fecha_registro, u.foto_perfil,
        r.rol_id, r.nombre AS rol
      FROM usuarios u
      LEFT JOIN usuarios_roles ur ON u.usuario_id = ur.usuario_id
      LEFT JOIN roles r ON ur.rol_id = r.rol_id
      ORDER BY u.usuario_id DESC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("ERROR LISTAR:", error);
    return res.status(500).json({ error: "Error al obtener los usuarios" });
  }
});


// Actualizar usuario (incluye foto_perfil y contraseña opcional)
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, correo, telefono, estado, password, foto_perfil } = req.body;

  if (!nombre || !correo) {
    return res.status(400).json({ success: false, message: "Datos incompletos" });
  }

  try {
    if (password && password.trim() !== '') {
      // Actualizar con nueva contraseña
      await pool.query(
        `UPDATE usuarios
         SET nombre = $1, correo = $2, telefono = $3, estado = $4,
             password_hash = crypt($5, gen_salt('bf')),
             foto_perfil = COALESCE($6, foto_perfil)
         WHERE usuario_id = $7`,
        [nombre, correo, telefono || null, estado ?? true, password, foto_perfil || null, id]
      );
    } else {
      // Sin cambio de contraseña
      await pool.query(
        `UPDATE usuarios
         SET nombre = $1, correo = $2, telefono = $3, estado = $4,
             foto_perfil = COALESCE($5, foto_perfil)
         WHERE usuario_id = $6`,
        [nombre, correo, telefono || null, estado ?? true, foto_perfil || null, id]
      );
    }

    return res.status(200).json({ success: true, message: "Usuario actualizado" });

  } catch (error) {
    console.error("❌ ERROR UPDATE:", error);
    return res.status(500).json({ success: false, message: "Error al actualizar usuario" });
  }
});


// Eliminar usuario (lógico)
app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE usuarios SET estado = false WHERE usuario_id = $1 RETURNING usuario_id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }
    return res.status(200).json({ success: true, message: "Usuario eliminado" });
  } catch (error) {
    console.error("❌ ERROR DELETE:", error);
    return res.status(500).json({ success: false, message: "Error al eliminar usuario" });
  }
});


// Crear usuario
app.post('/usuarios', async (req, res) => {
  const { nombre, correo, password, telefono, rol_id } = req.body;

  // Validar datos incompletos
  if (!nombre || !correo || !password || !rol_id) {
    return res.status(400).json({ success: false, message: "Datos incompletos" });
  }

  // VALIDACIÓN: Dominio exclusivo para Admin
  // Bloquea cualquier intento de registro con el dominio @agroconectasv.com
  if (correo.toLowerCase().endsWith('@agroconectasv.com')) {
    return res.status(400).json({
      success: false,
      message: "El dominio @agroconectasv.com es exclusivo para el personal administrativo y no está disponible para registro público."
    });
  }

  try {
    // Verificar si el correo ya existe
    const existe = await pool.query(
      `SELECT 1 FROM usuarios WHERE correo = $1`, [correo]
    );
    if (existe.rowCount > 0) {
      return res.status(400).json({
        success: false, code: "EMAIL_EXISTS",
        message: "El correo ingresado ya está registrado"
      });
    }

    // Insertar en la tabla usuarios
    const userResult = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, telefono)
       VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
       RETURNING usuario_id`,
      [nombre, correo, password, telefono || null]
    );

    const usuario_id = userResult.rows[0].usuario_id;

    // Asignar el rol
    await pool.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ($1, $2)`,
      [usuario_id, rol_id]
    );

    return res.status(200).json({ success: true, message: "Usuario creado correctamente" });

  } catch (error) {
    console.error("❌ ERROR CREATE USER:", error);
    return res.status(500).json({ success: false, message: "Error al crear usuario" });
  }
});



// ROLES

app.get('/roles', async (req, res) => {
  try {
    const result = await pool.query(`SELECT rol_id, nombre FROM roles ORDER BY rol_id`);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR ROLES:", error);
    return res.status(500).json({ success: false, message: "Error al obtener roles" });
  }
});



// CATEGORÍAS

app.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query('SELECT categoria_id, nombre FROM categorias ORDER BY nombre ASC');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR CATEGORIAS:", error);
    return res.status(500).json({ error: "Error al obtener categorías" });
  }
});



// PRODUCTOS

// Listar productos (El filtrado se manejará en la app según el rol)
app.get('/productos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.*,
        c.nombre AS nombre_categoria,
        u.nombre AS nombre_vendedor,
        u.telefono AS telefono_vendedor,
        u.foto_perfil AS foto_perfil_vendedor
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.categoria_id
       LEFT JOIN usuarios u ON p.usuario_id = u.usuario_id
       ORDER BY p.producto_id ASC`
    );
    // Eliminamos el "WHERE p.estado = true" para enviar la lista completa a la App
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR PRODUCTOS:", error);
    return res.status(500).json({ error: "Error al obtener productos" });
  }
});


// Crear producto
app.post('/productos', async (req, res) => {
  const {
    usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen,
    telefono_vendedor, latitud, longitud, direccion,
    acepta_efectivo, acepta_transferencia, acepta_tarjeta
  } = req.body;
  console.log("📦 Crear producto body:", JSON.stringify({ nombre, latitud, longitud, telefono_vendedor, direccion }));
  try {
    const result = await pool.query(
      `INSERT INTO productos (
         usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen,
         telefono_vendedor, latitud, longitud, direccion,
         acepta_efectivo, acepta_transferencia, acepta_tarjeta
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        usuario_id, categoria_id, nombre, descripcion, precio, existencia, imagen || null,
        telefono_vendedor || null,
        latitud != null && latitud !== undefined ? Number(latitud) : null,
        longitud != null && longitud !== undefined ? Number(longitud) : null,
        direccion || null,
        acepta_efectivo ?? false, acepta_transferencia ?? false, acepta_tarjeta ?? false
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE PRODUCT:", error);
    return res.status(500).json({ error: "Error al crear producto" });
  }
});


// Actualizar producto
app.put('/productos/:id', async (req, res) => {
  const { id } = req.params;
  const {
    categoria_id, nombre, descripcion, precio, existencia, estado, imagen,
    telefono_vendedor, latitud, longitud, direccion,
    acepta_efectivo, acepta_transferencia, acepta_tarjeta
  } = req.body;
  console.log("✏️ Actualizar producto id:", id, "body:", JSON.stringify({ nombre, latitud, longitud, telefono_vendedor, direccion }));
  try {
    await pool.query(
      `UPDATE productos 
       SET categoria_id = $1, nombre = $2, descripcion = $3, precio = $4,
           existencia = $5, estado = $6, imagen = $7,
           telefono_vendedor = COALESCE($8, telefono_vendedor),
           latitud = CASE WHEN $9::float8 IS NOT NULL THEN $9::float8 ELSE latitud END,
           longitud = CASE WHEN $10::float8 IS NOT NULL THEN $10::float8 ELSE longitud END,
           direccion = COALESCE($11, direccion),
           acepta_efectivo = $12,
           acepta_transferencia = $13,
           acepta_tarjeta = $14
       WHERE producto_id = $15`,
      [
        categoria_id, nombre, descripcion, precio, existencia, estado ?? true, imagen || null,
        telefono_vendedor || null,
        latitud != null && latitud !== undefined ? Number(latitud) : null,
        longitud != null && longitud !== undefined ? Number(longitud) : null,
        direccion || null,
        acepta_efectivo ?? false, acepta_transferencia ?? false, acepta_tarjeta ?? false,
        id
      ]
    );
    return res.status(200).json({ success: true, message: "Producto actualizado" });
  } catch (error) {
    console.error("❌ ERROR UPDATE PRODUCT:", error);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
});


// Obtener producto por ID
app.get('/productos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM productos WHERE producto_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET PRODUCT BY ID:", error);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});


// Eliminar producto (borrado lógico - cambia estado a false)
app.delete('/productos/:id', async (req, res) => {
  const { id } = req.params;
  console.log("🗑️ Eliminar producto id:", id);
  try {
    const result = await pool.query(
      `UPDATE productos SET estado = false WHERE producto_id = $1 RETURNING producto_id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Producto no encontrado" });
    }
    return res.status(200).json({ success: true, message: "Producto eliminado" });
  } catch (error) {
    console.error("❌ ERROR DELETE PRODUCT:", error);
    return res.status(500).json({ success: false, message: "Error al eliminar producto" });
  }
});



// PEDIDOS
// estado_id: 1=pendiente, 2=en proceso, 3=entregado, 4=cancelado

app.post('/pedidos', async (req, res) => {
  const { usuario_id, total, estado_id, detalles } = req.body;

  if (!usuario_id || !detalles || detalles.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos: se requiere usuario_id y al menos un producto"
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pedidoResult = await client.query(
      `INSERT INTO pedidos (usuario_id, estado_id)
       VALUES ($1, $2)
       RETURNING pedido_id, usuario_id, fecha, estado_id`,
      [usuario_id, estado_id || 1]
    );

    const pedido = pedidoResult.rows[0];
    const pedido_id = pedido.pedido_id;

    for (const item of detalles) {
      await client.query(
        `INSERT INTO detalles (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedido_id, item.producto_id, item.cantidad, item.precio]
      );
      await client.query(
        `UPDATE productos SET existencia = existencia - $1
         WHERE producto_id = $2 AND existencia >= $1`,
        [item.cantidad, item.producto_id]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      pedido_id: pedido_id,
      usuario_id: pedido.usuario_id,
      estado_id: pedido.estado_id,
      fecha: pedido.fecha
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("ERROR CREATE PEDIDO:", error);
    return res.status(500).json({ success: false, message: "Error al crear el pedido: " + error.message });
  } finally {
    client.release();
  }
});


// Obtener todos los pedidos
app.get('/pedidos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.pedido_id, p.usuario_id, p.fecha,
              e.nombre as estado, e.estado_id,
              u.nombre as nombre_cliente,
              COALESCE(SUM(d.cantidad * d.precio_unitario), 0) as total
       FROM pedidos p
       LEFT JOIN estados e ON p.estado_id = e.estado_id
       LEFT JOIN usuarios u ON p.usuario_id = u.usuario_id
       LEFT JOIN detalles d ON p.pedido_id = d.pedido_id
       GROUP BY p.pedido_id, e.nombre, e.estado_id, u.nombre
       ORDER BY p.fecha DESC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("ERROR GET PEDIDOS:", error);
    return res.status(500).json({ error: "Error al obtener pedidos" });
  }
});


// Obtener todos los pedidos de un usuario
app.get('/pedidos/usuario/:usuario_id', async (req, res) => {
  const { usuario_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
        p.pedido_id,
        p.fecha,
        e.nombre as estado,
        e.estado_id,
        COALESCE(SUM(d.cantidad * d.precio_unitario), 0) as total,
        MIN(uv.nombre) as nombre_vendedor,
        MIN(uv.telefono) as telefono_vendedor,
        MIN(uv.foto_perfil) as foto_perfil_vendedor,
        json_agg(
          json_build_object(
            'producto_id', d.producto_id,
            'nombre', pr.nombre,
            'cantidad', d.cantidad,
            'precio_unitario', d.precio_unitario
          )
        ) FILTER (WHERE d.producto_id IS NOT NULL) as detalles
       FROM pedidos p
       LEFT JOIN estados e ON p.estado_id = e.estado_id
       LEFT JOIN detalles d ON p.pedido_id = d.pedido_id
       LEFT JOIN productos pr ON d.producto_id = pr.producto_id
       LEFT JOIN usuarios uv ON pr.usuario_id = uv.usuario_id
       WHERE p.usuario_id = $1::int
       GROUP BY p.pedido_id, p.fecha, e.nombre, e.estado_id
       ORDER BY p.fecha DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR GET PEDIDOS USUARIO:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error al obtener pedidos",
      error: error.message
    });
  }
});


// Obtener pedido por ID
app.get('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT p.*, e.nombre as estado_nombre
       FROM pedidos p
       LEFT JOIN estados e ON p.estado_id = e.estado_id
       WHERE p.pedido_id = $1`, [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Pedido no encontrado" });
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener pedido" });
  }
});


// Actualizar pedido por ID
app.put('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { estado_id } = req.body;
  try {
    await pool.query(
      `UPDATE pedidos SET estado_id = $1 WHERE pedido_id = $2`,
      [estado_id, id]
    );
    return res.status(200).json({ success: true, message: "Pedido actualizado" });
  } catch (error) {
    console.error("ERROR UPDATE PEDIDO:", error);
    return res.status(500).json({ error: "Error al actualizar pedido" });
  }
});


// Obtener todos los pedidos de un vendedor (incluye detalles) por ID
app.get('/pedidos/vendedor/:vendedor_id', async (req, res) => {
  const { vendedor_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
        p.pedido_id, p.fecha,
        p.usuario_id as cliente_id,
        u.nombre as nombre_cliente,
        u.telefono as telefono_cliente,
        u.foto_perfil as foto_perfil_cliente,
        e.nombre as estado, e.estado_id,
        SUM(d.cantidad * d.precio_unitario) as total,
        json_agg(json_build_object(
          'producto_id', d.producto_id,
          'nombre', pr.nombre,
          'cantidad', d.cantidad,
          'precio_unitario', d.precio_unitario
        )) as detalles
       FROM pedidos p
       JOIN detalles d ON p.pedido_id = d.pedido_id
       JOIN productos pr ON d.producto_id = pr.producto_id
       JOIN usuarios u ON p.usuario_id = u.usuario_id
       LEFT JOIN estados e ON p.estado_id = e.estado_id
       WHERE pr.usuario_id = $1
       GROUP BY p.pedido_id, p.fecha, p.usuario_id, u.nombre, u.telefono, u.foto_perfil, e.nombre, e.estado_id
       ORDER BY p.fecha DESC`,
      [vendedor_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("ERROR GET PEDIDOS VENDEDOR:", error);
    return res.status(500).json({ error: "Error al obtener pedidos del vendedor" });
  }
});



// CALIFICACIONES

// Calificar un producto de un pedido
app.post('/calificaciones', async (req, res) => {
  const { pedido_id, producto_id, puntuacion, comentario } = req.body;

  if (!pedido_id || !producto_id || !puntuacion) {
    return res.status(400).json({ success: false, message: "Datos incompletos para la calificación" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO calificaciones (pedido_id, producto_id, puntuacion, comentario)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [pedido_id, producto_id, puntuacion, comentario || null]
    );
    return res.status(201).json({
      success: true,
      message: "¡Gracias por tu calificación!",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ ERROR CALIFICAR:", error);
    if (error.code === '42501') {
      return res.status(401).json({
        success: false,
        message: "Error de permisos en la base de datos (RLS). Verifica las políticas en Supabase."
      });
    }
    return res.status(500).json({ success: false, message: "Error al guardar la calificación" });
  }
});



// CONTRASEÑA

// Actualizar contraseña
app.post('/update-password', async (req, res) => {
  const { correo, nuevaPassword } = req.body;

  if (!correo || !nuevaPassword) {
    return res.status(200).json({ success: false, message: "Datos incompletos" });
  }

  try {
    const userCheck = await pool.query(
      "SELECT usuario_id FROM usuarios WHERE correo = $1 AND estado = true",
      [correo]
    );

    if (userCheck.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No se encontró una cuenta activa con ese correo"
      });
    }

    await pool.query(
      `UPDATE usuarios SET password_hash = crypt($1, gen_salt('bf')) WHERE correo = $2`,
      [nuevaPassword, correo]
    );

    return res.status(200).json({ success: true, message: "Contraseña actualizada exitosamente" });

  } catch (error) {
    console.error("❌ UPDATE PASSWORD ERROR:", error);
    return res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});

// ============================================
// PRECIOS AGRÍCOLAS (módulo Centro de Inteligencia Agrícola)
// ============================================

// Últimos precios por producto, con tendencia calculada vs. el registro anterior
app.get('/precios/ultimos', async (req, res) => {
  try {
    const result = await pool.query(
      `WITH ranked AS (
         SELECT *,
           ROW_NUMBER() OVER (PARTITION BY producto ORDER BY fecha DESC) AS rn,
           LAG(precio_promedio) OVER (PARTITION BY producto ORDER BY fecha ASC) AS precio_anterior
         FROM precios_agricolas
       )
       SELECT
         precio_id, producto, mercado, departamento,
         precio_minimo, precio_promedio, precio_maximo, fecha,
         CASE
           WHEN precio_anterior IS NULL THEN NULL
           WHEN precio_promedio > precio_anterior THEN 'sube'
           WHEN precio_promedio < precio_anterior THEN 'baja'
           ELSE 'estable'
         END AS tendencia
       FROM ranked
       WHERE rn = 1
       ORDER BY producto ASC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR PRECIOS ULTIMOS:", error);
    return res.status(500).json({ error: "Error al obtener precios" });
  }
});

// Historial completo de un producto (para el gráfico)
app.get('/precios/historial', async (req, res) => {
  const { producto } = req.query;

  if (!producto) {
    return res.status(400).json({ error: "Falta el parámetro 'producto'" });
  }

  try {
    const result = await pool.query(
      `SELECT precio_id, producto, mercado, departamento,
              precio_minimo, precio_promedio, precio_maximo, fecha
       FROM precios_agricolas
       WHERE producto = $1
       ORDER BY fecha ASC`,
      [producto]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR PRECIOS HISTORIAL:", error);
    return res.status(500).json({ error: "Error al obtener historial de precios" });
  }
});

// Registrar un nuevo precio (uso admin / carga manual)
app.post('/precios', async (req, res) => {
  const { producto, mercado, departamento, precio_minimo, precio_promedio, precio_maximo, fecha } = req.body;

  if (!producto || !mercado || !departamento || precio_minimo == null || precio_promedio == null || precio_maximo == null || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO precios_agricolas
         (producto, mercado, departamento, precio_minimo, precio_promedio, precio_maximo, fecha)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [producto, mercado, departamento, Number(precio_minimo), Number(precio_promedio), Number(precio_maximo), fecha]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE PRECIO:", error);
    return res.status(500).json({ error: "Error al registrar precio" });
  }
});

// ============================================
// MI FINCA (módulo Centro de Inteligencia Agrícola)
// ============================================

// Listar fincas de un usuario
app.get('/fincas', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM fincas WHERE usuario_id = $1 ORDER BY fecha_registro DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR FINCAS:", error);
    return res.status(500).json({ error: "Error al obtener fincas" });
  }
});

// Obtener una finca por ID
app.get('/fincas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM fincas WHERE finca_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Finca no encontrada" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET FINCA:", error);
    return res.status(500).json({ error: "Error al obtener finca" });
  }
});

// Crear finca
app.post('/fincas', async (req, res) => {
  const { usuario_id, nombre, latitud, longitud, area, cultivo, fecha_siembra, variedad } = req.body;

  if (!usuario_id || !nombre || !area || !cultivo) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO fincas (usuario_id, nombre, latitud, longitud, area, cultivo, fecha_siembra, variedad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        usuario_id, nombre,
        latitud != null ? Number(latitud) : null,
        longitud != null ? Number(longitud) : null,
        Number(area), cultivo, fecha_siembra || null, variedad || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE FINCA:", error);
    return res.status(500).json({ error: "Error al crear finca" });
  }
});

// Eliminar finca
app.delete('/fincas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM fincas WHERE finca_id = $1 RETURNING finca_id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Finca no encontrada" });
    }
    return res.status(200).json({ success: true, message: "Finca eliminada" });
  } catch (error) {
    console.error("❌ ERROR DELETE FINCA:", error);
    return res.status(500).json({ success: false, message: "Error al eliminar finca" });
  }
});

// ── Actividades (bitácora) ──────────────────────────────────────────

// Listar actividades de una finca
app.get('/fincas/:id/actividades', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM actividades_finca WHERE finca_id = $1 ORDER BY fecha DESC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ACTIVIDADES:", error);
    return res.status(500).json({ error: "Error al obtener actividades" });
  }
});

// Registrar actividad
app.post('/fincas/:id/actividades', async (req, res) => {
  const { id } = req.params;
  const { tipo, descripcion, fecha, foto_url } = req.body;

  if (!tipo || !descripcion || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO actividades_finca (finca_id, tipo, descripcion, fecha, foto_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [id, tipo, descripcion, fecha, foto_url || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ACTIVIDAD:", error);
    return res.status(500).json({ error: "Error al registrar actividad" });
  }
});

// ── Fotos (galería) ──────────────────────────────────────────────────

// Listar fotos de una finca
app.get('/fincas/:id/fotos', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM fotos_finca WHERE finca_id = $1 ORDER BY fecha DESC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR FOTOS FINCA:", error);
    return res.status(500).json({ error: "Error al obtener fotos" });
  }
});

// Agregar foto a la finca (la subida del archivo ya ocurrió en Supabase Storage desde la app)
app.post('/fincas/:id/fotos', async (req, res) => {
  const { id } = req.params;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Falta la URL de la foto" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO fotos_finca (finca_id, url) VALUES ($1, $2) RETURNING *`,
      [id, url]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE FOTO FINCA:", error);
    return res.status(500).json({ error: "Error al guardar foto" });
  }
});

// ============================================
// AGENDA AGRÍCOLA (módulo Centro de Inteligencia Agrícola)
// ============================================

// Listar eventos de un usuario
app.get('/agenda', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM agenda_agricola WHERE usuario_id = $1 ORDER BY fecha ASC, hora ASC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR AGENDA:", error);
    return res.status(500).json({ error: "Error al obtener la agenda" });
  }
});

// Crear evento
app.post('/agenda', async (req, res) => {
  const { usuario_id, finca_id, titulo, descripcion, fecha, hora, tipo, repetir } = req.body;

  if (!usuario_id || !titulo || !fecha || !hora) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO agenda_agricola (usuario_id, finca_id, titulo, descripcion, fecha, hora, tipo, repetir)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [usuario_id, finca_id || null, titulo, descripcion || null, fecha, hora, tipo || 'General', repetir || 'ninguna']
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE EVENTO:", error);
    return res.status(500).json({ error: "Error al crear el evento" });
  }
});

// Eliminar evento
app.delete('/agenda/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM agenda_agricola WHERE evento_id = $1 RETURNING evento_id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Evento no encontrado" });
    }
    return res.status(200).json({ success: true, message: "Evento eliminado" });
  } catch (error) {
    console.error("❌ ERROR DELETE EVENTO:", error);
    return res.status(500).json({ success: false, message: "Error al eliminar el evento" });
  }
});

// ============================================
// LOGÍSTICA (módulo Centro de Inteligencia Agrícola)
// estado: 'solicitado' | 'aceptado' | 'en_camino' | 'entregado' | 'cancelado'
// ============================================

// Mis solicitudes (como quien pide el transporte)
app.get('/transporte/mis-solicitudes', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT st.*,
              u.nombre AS nombre_solicitante,
              ut.nombre AS nombre_transportista
       FROM solicitudes_transporte st
       LEFT JOIN usuarios u ON st.usuario_id = u.usuario_id
       LEFT JOIN usuarios ut ON st.transportista_id = ut.usuario_id
       WHERE st.usuario_id = $1
       ORDER BY st.fecha_solicitud DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR MIS SOLICITUDES:", error);
    return res.status(500).json({ error: "Error al obtener solicitudes" });
  }
});

// Solicitudes disponibles para aceptar (panel transportista)
app.get('/transporte/disponibles', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT st.*,
              u.nombre AS nombre_solicitante,
              ut.nombre AS nombre_transportista
       FROM solicitudes_transporte st
       LEFT JOIN usuarios u ON st.usuario_id = u.usuario_id
       LEFT JOIN usuarios ut ON st.transportista_id = ut.usuario_id
       WHERE st.estado = 'solicitado'
       ORDER BY st.fecha_solicitud ASC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR SOLICITUDES DISPONIBLES:", error);
    return res.status(500).json({ error: "Error al obtener solicitudes disponibles" });
  }
});

// Obtener una solicitud por ID
app.get('/transporte/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT st.*,
              u.nombre AS nombre_solicitante,
              ut.nombre AS nombre_transportista
       FROM solicitudes_transporte st
       LEFT JOIN usuarios u ON st.usuario_id = u.usuario_id
       LEFT JOIN usuarios ut ON st.transportista_id = ut.usuario_id
       WHERE st.solicitud_id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET SOLICITUD:", error);
    return res.status(500).json({ error: "Error al obtener la solicitud" });
  }
});

// Crear solicitud de transporte
app.post('/transporte', async (req, res) => {
  const { usuario_id, origen_direccion, origen_lat, origen_lon, destino_direccion, nota } = req.body;

  if (!usuario_id || !origen_direccion || !destino_direccion) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO solicitudes_transporte
         (usuario_id, origen_direccion, origen_lat, origen_lon, destino_direccion, nota, estado)
       VALUES ($1,$2,$3,$4,$5,$6,'solicitado')
       RETURNING *`,
      [
        usuario_id, origen_direccion,
        origen_lat != null ? Number(origen_lat) : null,
        origen_lon != null ? Number(origen_lon) : null,
        destino_direccion, nota || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE SOLICITUD:", error);
    return res.status(500).json({ error: "Error al crear la solicitud" });
  }
});

// Actualizar estado (aceptar / iniciar viaje / marcar entregado)
app.put('/transporte/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado, transportista_id } = req.body;

  const estadosValidos = ['solicitado', 'aceptado', 'en_camino', 'entregado', 'cancelado'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }

  try {
    const result = await pool.query(
      `UPDATE solicitudes_transporte
       SET estado = $1,
           transportista_id = COALESCE($2, transportista_id),
           fecha_actualizacion = NOW()
       WHERE solicitud_id = $3
       RETURNING *`,
      [estado, transportista_id || null, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR UPDATE ESTADO TRANSPORTE:", error);
    return res.status(500).json({ error: "Error al actualizar el estado" });
  }
});

// ============================================
// GANADERÍA (AgroConecta OS)
// ============================================

// Listar animales de un usuario
app.get('/ganaderia/animales', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM animales WHERE usuario_id = $1 ORDER BY animal_id DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ANIMALES:", error);
    return res.status(500).json({ error: "Error al obtener animales" });
  }
});

// Obtener un animal por ID
app.get('/ganaderia/animales/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM animales WHERE animal_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Animal no encontrado" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET ANIMAL:", error);
    return res.status(500).json({ error: "Error al obtener el animal" });
  }
});

// Crear animal
app.post('/ganaderia/animales', async (req, res) => {
  const { usuario_id, tipo, identificador, raza, sexo, fecha_nacimiento, peso_actual } = req.body;

  if (!usuario_id || !tipo || !identificador || !sexo) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO animales (usuario_id, tipo, identificador, raza, sexo, fecha_nacimiento, peso_actual, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Activo')
       RETURNING *`,
      [
        usuario_id, tipo, identificador, raza || null, sexo,
        fecha_nacimiento || null,
        peso_actual != null ? Number(peso_actual) : null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ANIMAL:", error);
    return res.status(500).json({ error: "Error al registrar el animal" });
  }
});

// ── Peso ──────────────────────────────────────────────────────────────
app.get('/ganaderia/animales/:id/pesos', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_peso WHERE animal_id = $1 ORDER BY fecha ASC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR PESOS:", error);
    return res.status(500).json({ error: "Error al obtener el historial de peso" });
  }
});

app.post('/ganaderia/animales/:id/pesos', async (req, res) => {
  const { id } = req.params;
  const { peso, fecha } = req.body;

  if (peso == null || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_peso (animal_id, peso, fecha) VALUES ($1,$2,$3) RETURNING *`,
      [id, Number(peso), fecha]
    );
    // Actualiza también el peso_actual del animal
    await pool.query(`UPDATE animales SET peso_actual = $1 WHERE animal_id = $2`, [Number(peso), id]);

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE PESO:", error);
    return res.status(500).json({ error: "Error al registrar el peso" });
  }
});

// ── Control sanitario ────────────────────────────────────────────────
app.get('/ganaderia/animales/:id/sanitario', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_sanitarios WHERE animal_id = $1 ORDER BY fecha DESC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR SANITARIO:", error);
    return res.status(500).json({ error: "Error al obtener el historial sanitario" });
  }
});

app.post('/ganaderia/animales/:id/sanitario', async (req, res) => {
  const { id } = req.params;
  const { tipo, producto, fecha, proxima_fecha, nota } = req.body;

  if (!tipo || !producto || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_sanitarios (animal_id, tipo, producto, fecha, proxima_fecha, nota)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [id, tipo, producto, fecha, proxima_fecha || null, nota || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE SANITARIO:", error);
    return res.status(500).json({ error: "Error al registrar el evento sanitario" });
  }
});


// ============================================
// ACUICULTURA Y PESCA (AgroConecta OS)
// ============================================

// Listar estanques de un usuario
app.get('/acuicultura/estanques', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM estanques WHERE usuario_id = $1 ORDER BY estanque_id DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ESTANQUES:", error);
    return res.status(500).json({ error: "Error al obtener estanques" });
  }
});

// Obtener un estanque por ID
app.get('/acuicultura/estanques/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM estanques WHERE estanque_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Estanque no encontrado" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET ESTANQUE:", error);
    return res.status(500).json({ error: "Error al obtener el estanque" });
  }
});

// Crear estanque
app.post('/acuicultura/estanques', async (req, res) => {
  const { usuario_id, especie, nombre, area_m2, cantidad_inicial, fecha_siembra } = req.body;

  if (!usuario_id || !especie || !nombre || !cantidad_inicial) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO estanques (usuario_id, especie, nombre, area_m2, cantidad_inicial, cantidad_actual, fecha_siembra, estado)
       VALUES ($1,$2,$3,$4,$5,$5,$6,'Activo')
       RETURNING *`,
      [
        usuario_id, especie, nombre,
        area_m2 != null ? Number(area_m2) : null,
        Number(cantidad_inicial), fecha_siembra || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ESTANQUE:", error);
    return res.status(500).json({ error: "Error al registrar el estanque" });
  }
});

// ── Calidad de agua ──────────────────────────────────────────────────
app.get('/acuicultura/estanques/:id/calidad-agua', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_calidad_agua WHERE estanque_id = $1 ORDER BY fecha ASC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR CALIDAD AGUA:", error);
    return res.status(500).json({ error: "Error al obtener mediciones de agua" });
  }
});

app.post('/acuicultura/estanques/:id/calidad-agua', async (req, res) => {
  const { id } = req.params;
  const { temperatura, ph, oxigeno_disuelto, fecha } = req.body;

  if (!fecha) {
    return res.status(400).json({ error: "Falta la fecha" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_calidad_agua (estanque_id, temperatura, ph, oxigeno_disuelto, fecha)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        id,
        temperatura != null ? Number(temperatura) : null,
        ph != null ? Number(ph) : null,
        oxigeno_disuelto != null ? Number(oxigeno_disuelto) : null,
        fecha
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE CALIDAD AGUA:", error);
    return res.status(500).json({ error: "Error al registrar la medición" });
  }
});

// ── Alimentación ─────────────────────────────────────────────────────
app.get('/acuicultura/estanques/:id/alimentacion', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_alimentacion_acuicola WHERE estanque_id = $1 ORDER BY fecha DESC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ALIMENTACION:", error);
    return res.status(500).json({ error: "Error al obtener alimentación" });
  }
});

app.post('/acuicultura/estanques/:id/alimentacion', async (req, res) => {
  const { id } = req.params;
  const { cantidad_kg, tipo_alimento, fecha } = req.body;

  if (cantidad_kg == null || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_alimentacion_acuicola (estanque_id, cantidad_kg, tipo_alimento, fecha)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [id, Number(cantidad_kg), tipo_alimento || null, fecha]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ALIMENTACION:", error);
    return res.status(500).json({ error: "Error al registrar la alimentación" });
  }
});

// ============================================
// ACUICULTURA Y PESCA (AgroConecta OS)
// ============================================

// Listar estanques de un usuario
app.get('/acuicultura/estanques', async (req, res) => {
  const { usuario_id } = req.query;
  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el parámetro 'usuario_id'" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM estanques WHERE usuario_id = $1 ORDER BY estanque_id DESC`,
      [usuario_id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ESTANQUES:", error);
    return res.status(500).json({ error: "Error al obtener estanques" });
  }
});

// Obtener un estanque por ID
app.get('/acuicultura/estanques/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM estanques WHERE estanque_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Estanque no encontrado" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR GET ESTANQUE:", error);
    return res.status(500).json({ error: "Error al obtener el estanque" });
  }
});

// Crear estanque
app.post('/acuicultura/estanques', async (req, res) => {
  const { usuario_id, especie, nombre, area_m2, cantidad_inicial, fecha_siembra } = req.body;

  if (!usuario_id || !especie || !nombre || !cantidad_inicial) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO estanques (usuario_id, especie, nombre, area_m2, cantidad_inicial, cantidad_actual, fecha_siembra, estado)
       VALUES ($1,$2,$3,$4,$5,$5,$6,'Activo')
       RETURNING *`,
      [
        usuario_id, especie, nombre,
        area_m2 != null ? Number(area_m2) : null,
        Number(cantidad_inicial), fecha_siembra || null
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ESTANQUE:", error);
    return res.status(500).json({ error: "Error al registrar el estanque" });
  }
});

// ── Calidad de agua ──────────────────────────────────────────────────
app.get('/acuicultura/estanques/:id/calidad-agua', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_calidad_agua WHERE estanque_id = $1 ORDER BY fecha ASC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR CALIDAD AGUA:", error);
    return res.status(500).json({ error: "Error al obtener mediciones de agua" });
  }
});

app.post('/acuicultura/estanques/:id/calidad-agua', async (req, res) => {
  const { id } = req.params;
  const { temperatura, ph, oxigeno_disuelto, fecha } = req.body;

  if (!fecha) {
    return res.status(400).json({ error: "Falta la fecha" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_calidad_agua (estanque_id, temperatura, ph, oxigeno_disuelto, fecha)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        id,
        temperatura != null ? Number(temperatura) : null,
        ph != null ? Number(ph) : null,
        oxigeno_disuelto != null ? Number(oxigeno_disuelto) : null,
        fecha
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE CALIDAD AGUA:", error);
    return res.status(500).json({ error: "Error al registrar la medición" });
  }
});

// ── Alimentación ─────────────────────────────────────────────────────
app.get('/acuicultura/estanques/:id/alimentacion', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM registros_alimentacion_acuicola WHERE estanque_id = $1 ORDER BY fecha DESC`,
      [id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ ERROR LISTAR ALIMENTACION:", error);
    return res.status(500).json({ error: "Error al obtener alimentación" });
  }
});

app.post('/acuicultura/estanques/:id/alimentacion', async (req, res) => {
  const { id } = req.params;
  const { cantidad_kg, tipo_alimento, fecha } = req.body;

  if (cantidad_kg == null || !fecha) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_alimentacion_acuicola (estanque_id, cantidad_kg, tipo_alimento, fecha)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [id, Number(cantidad_kg), tipo_alimento || null, fecha]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ ERROR CREATE ALIMENTACION:", error);
    return res.status(500).json({ error: "Error al registrar la alimentación" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log("🚀 Servidor corriendo en puerto", PORT); });

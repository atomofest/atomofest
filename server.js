const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;



// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // sirve index.html

// Rutas de archivos
const DB_FILE = path.join(__dirname, "database.json");
const QRS_DIR = path.join(__dirname, "qrs");

// Asegurar archivos/carpetas base
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]");
}
if (!fs.existsSync(QRS_DIR)) {
  fs.mkdirSync(QRS_DIR);
}

// 🔥 Configurar transporte de correo (Gmail + contraseña de aplicación)

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});


// Utilidades DB
function readDB() {
  const data = fs.readFileSync(DB_FILE, "utf8");
  return JSON.parse(data);
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Función principal: registrar, generar QR y (opcional) mandar mail
async function registrarInvitado(nombre, email) {
  const db = readDB();

  const nuevoRegistro = {
    id: uuidv4(),
    nombre,
    email,
    fecha: new Date().toISOString(),
    usado: false,
  };

  db.push(nuevoRegistro);
  saveDB(db);

  console.log("✔ Nuevo invitado guardado:", nuevoRegistro);

  // Generar QR con link al ticket
  const qrData = `${BASE_URL}/ticket/${nuevoRegistro.id}`;
  const qrPath = path.join(QRS_DIR, `${nuevoRegistro.id}.png`);

  await QRCode.toFile(qrPath, qrData);
  console.log("📷 QR generado en:", qrPath);

  // Intentar enviar correo, pero sin botar el servidor si falla
  try {
    await transporter.sendMail({
      from: '"AtomoFest" <atomofestmail@gmail.com>', // <-- tu correo aquí también
      to: email,
      subject: "Tu entrada para el evento 🎫",
      html: `
        <h1>¡Hola ${nombre}!</h1>
        <p>Gracias por registrarte en AtomoFest.</p>
        <p>Aquí tienes tu <strong>QR de entrada</strong> como archivo adjunto.</p>
        <p>También puedes mostrar este correo en la puerta.</p>
      `,
      attachments: [
        {
          filename: `${nuevoRegistro.id}.png`,
          path: qrPath,
        },
      ],
    });

    console.log("📧 Correo enviado correctamente a", email);
  } catch (err) {
    console.error("⚠ Error al enviar correo:", err.message);
    // No lanzamos el error de nuevo para que el servidor no se caiga
  }

  // Devolvemos también la ruta del QR para usarla en el front
  return {
    ...nuevoRegistro,
    qrPublicPath: `/qrs/${nuevoRegistro.id}.png`,
  };
}

// GET de prueba rápida (para usar desde el navegador con query params)
app.get("/api/registrar", async (req, res) => {
  const { nombre, email } = req.query;

  if (!nombre || !email) {
    return res
      .status(400)
      .json({ ok: false, error: "Falta nombre o email (?nombre=...&email=...)" });
  }

  try {
    const reg = await registrarInvitado(nombre, email);
    return res.json({
      ok: true,
      mensaje: "Registro guardado, QR generado (GET)",
      id: reg.id,
      qr: reg.qrPublicPath,
    });
  } catch (err) {
    console.error("❌ Error interno en /api/registrar GET:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
});

// POST que usa el formulario real
app.post("/api/registrar", async (req, res) => {
  const { nombre, email } = req.body;

  if (!nombre || !email) {
    return res
      .status(400)
      .json({ ok: false, error: "Falta nombre o email en el formulario" });
  }

  try {
    const reg = await registrarInvitado(nombre, email);
    return res.json({
      ok: true,
      mensaje: "Registro guardado, QR generado (POST)",
      id: reg.id,
      qr: reg.qrPublicPath,
    });
  } catch (err) {
    console.error("❌ Error interno en /api/registrar POST:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
});

// Servir los PNG de QR
app.use("/qrs", express.static(QRS_DIR));

// Página de ticket para cuando se escanea el QR
app.get("/ticket/:id", (req, res) => {
  const db = readDB();
  const ticket = db.find((t) => t.id === req.params.id);

  if (!ticket) {
    return res.status(404).send("❌ Ticket no encontrado o inválido");
  }

  res.send(`
    <h1>✅ Ticket válido</h1>
    <p><strong>Nombre:</strong> ${ticket.nombre}</p>
    <p><strong>Email:</strong> ${ticket.email}</p>
    <p><strong>Fecha de registro:</strong> ${ticket.fecha}</p>
    <p><strong>Estado:</strong> ${ticket.usado ? "USADO 🚫" : "NO USADO ✅"}</p>
  `);
});

// Levantar servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Zoop Banner Server' }));

// ── Face detection (Face++) ───────────────────────────────────────
app.post('/detect-face', upload.single('image'), async (req, res) => {
  try {
    const { facepp_key, facepp_secret } = req.body;
    if (!facepp_key || !facepp_secret) return res.status(400).json({ error: 'Missing Face++ credentials' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const form = new FormData();
    form.append('api_key',           facepp_key);
    form.append('api_secret',        facepp_secret);
    form.append('image_file',        req.file.buffer, { filename: 'photo.jpg', contentType: req.file.mimetype });
    form.append('return_attributes', 'none');

    const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
      method: 'POST',
      body:   form
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Background removal (PhotoRoom) ───────────────────────────────
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  try {
    const { photoroom_key } = req.body;
    if (!photoroom_key) return res.status(400).json({ error: 'Missing PhotoRoom API key' });
    if (!req.file)      return res.status(400).json({ error: 'No image provided' });

    const form = new FormData();
    form.append('image_file',   req.file.buffer, { filename: 'photo.jpg', contentType: req.file.mimetype });
    form.append('output_type',  'cutout');

    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method:  'POST',
      headers: { 'x-api-key': photoroom_key, ...form.getHeaders() },
      body:    form
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const buffer = await response.buffer();
    res.set('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upload to ImgBB ───────────────────────────────────────────────
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const { imgbb_key } = req.body;
    if (!imgbb_key) return res.status(400).json({ error: 'Missing ImgBB key' });
    if (!req.file)  return res.status(400).json({ error: 'No image provided' });

    const base64 = req.file.buffer.toString('base64');
    const form   = new FormData();
    form.append('image', base64);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, {
      method: 'POST',
      body:   form
    });

    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: data.error?.message || 'Upload failed' });
    res.json({ url: data.data.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate QR and upload ────────────────────────────────────────
app.post('/generate-qr', express.json(), async (req, res) => {
  try {
    const { link, imgbb_key } = req.body;
    if (!link)     return res.status(400).json({ error: 'Missing link' });
    if (!imgbb_key) return res.status(400).json({ error: 'Missing ImgBB key' });

    // Fetch QR code image
    const qrRes    = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(link)}`);
    const qrBuffer = await qrRes.buffer();

    // Upload to ImgBB
    const base64 = qrBuffer.toString('base64');
    const form   = new FormData();
    form.append('image', base64);

    const uploadRes  = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, { method:'POST', body:form });
    const uploadData = await uploadRes.json();
    if (!uploadData.success) return res.status(400).json({ error: 'QR upload failed' });
    res.json({ url: uploadData.data.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zoop Banner Server running on port ${PORT}`));

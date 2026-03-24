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
app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  service: 'Zoop Banner Server',
  env_check: {
    photoroom: process.env.PHOTOROOM_API_KEY ? 'SET (' + process.env.PHOTOROOM_API_KEY.substring(0,10) + '...)' : 'NOT SET',
    facepp_key: process.env.FACEPP_API_KEY ? 'SET' : 'NOT SET',
    facepp_secret: process.env.FACEPP_API_SECRET ? 'SET' : 'NOT SET'
  }
}));

// ── Face detection (Face++) ───────────────────────────────────────
app.post('/detect-face', upload.single('image'), async (req, res) => {
  try {
    const facepp_key    = process.env.FACEPP_API_KEY    || req.body.facepp_key;
    const facepp_secret = process.env.FACEPP_API_SECRET || req.body.facepp_secret;

    if (!facepp_key || !facepp_secret) return res.status(400).json({ error: 'Missing Face++ credentials — set FACEPP_API_KEY and FACEPP_API_SECRET in Render environment variables' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    console.log('Detecting face, image size:', req.file.size);

    const form = new FormData();
    form.append('api_key',           facepp_key);
    form.append('api_secret',        facepp_secret);
    form.append('image_file',        req.file.buffer, {
      filename:    'photo.jpg',
      contentType: req.file.mimetype
    });
    form.append('return_attributes', 'none');

    const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
      method: 'POST',
      body:   form
    });

    const text = await response.text();
    console.log('Face++ response:', text.substring(0, 200));

    try {
      const data = JSON.parse(text);
      return res.json(data);
    } catch(e) {
      return res.status(500).json({ error: 'Invalid Face++ response', raw: text.substring(0,200) });
    }

  } catch (err) {
    console.error('Face detect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Background removal (PhotoRoom) ───────────────────────────────
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  try {
    const photoroom_key = process.env.PHOTOROOM_API_KEY || req.body.photoroom_key;

    if (!photoroom_key) return res.status(400).json({ error: 'Missing PhotoRoom API key — set PHOTOROOM_API_KEY in Render environment variables' });
    if (!req.file)      return res.status(400).json({ error: 'No image provided' });

    console.log('Removing background, image size:', req.file.size);
    console.log('PhotoRoom key starts with:', photoroom_key.substring(0, 15));

    const form = new FormData();
    form.append('imageFile', req.file.buffer, {
      filename:    'photo.jpg',
      contentType: req.file.mimetype
    });
    form.append('removeBackground', 'true');
    form.append('padding',          '0.1');

    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method:  'POST',
      headers: {
        'x-api-key':  photoroom_key,
        'Accept':     'image/png, application/json',
        ...form.getHeaders()
      },
      body: form
    });

    console.log('PhotoRoom status:', response.status);
    console.log('PhotoRoom content-type:', response.headers.get('content-type'));

    if (response.ok) {
      const buffer = await response.buffer();
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', buffer.length);
      return res.send(buffer);
    } else {
      const errText = await response.text();
      console.error('PhotoRoom error:', errText);
      return res.status(response.status).json({ error: errText });
    }

  } catch (err) {
    console.error('Remove BG error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Upload to ImgBB ───────────────────────────────────────────────
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const imgbb_key = req.body.imgbb_key;
    if (!imgbb_key) return res.status(400).json({ error: 'Missing ImgBB key' });
    if (!req.file)  return res.status(400).json({ error: 'No image provided' });

    console.log('Uploading image to ImgBB, size:', req.file.size);

    const base64 = req.file.buffer.toString('base64');
    const form   = new FormData();
    form.append('image', base64);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, {
      method: 'POST',
      body:   form
    });

    const data = await response.json();
    console.log('ImgBB success:', data.success, 'URL:', data?.data?.url?.substring(0,50));

    if (!data.success) return res.status(400).json({ error: data.error?.message || 'Upload failed' });
    res.json({ url: data.data.url });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Generate QR and upload ────────────────────────────────────────
app.post('/generate-qr', async (req, res) => {
  try {
    const { link, imgbb_key } = req.body;
    if (!link)      return res.status(400).json({ error: 'Missing link' });
    if (!imgbb_key) return res.status(400).json({ error: 'Missing ImgBB key' });

    console.log('Generating QR for:', link.substring(0, 50));

    const qrRes    = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(link)}`);
    const qrBuffer = await qrRes.buffer();

    const base64 = qrBuffer.toString('base64');
    const form   = new FormData();
    form.append('image', base64);

    const uploadRes  = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, { method: 'POST', body: form });
    const uploadData = await uploadRes.json();

    if (!uploadData.success) return res.status(400).json({ error: 'QR upload failed' });
    res.json({ url: uploadData.data.url });

  } catch (err) {
    console.error('QR error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zoop Banner Server running on port ${PORT}`));

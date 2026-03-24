const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const path = require('path');

// ── Serve frontend ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ 
  status: 'ok', 
  service: 'Zoop Banner Server',
  env_check: {
    removebg: process.env.REMOVEBG_API_KEY ? 'SET (' + process.env.REMOVEBG_API_KEY.substring(0,8) + '...)' : 'NOT SET',
    luxand: process.env.LUXAND_TOKEN ? 'SET (env)' : 'Using default token'
  }
}));



// ── Face detection (Luxand) ──────────────────────────────────────
app.post('/detect-face', upload.single('image'), async (req, res) => {
  try {
    const luxand_token = process.env.LUXAND_TOKEN || '29d1d436ace7471f840540c0bba1cccc';
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    console.log('Detecting face with Luxand, image size:', req.file.size);

    const form = new FormData();
    form.append('photo', req.file.buffer, {
      filename:    'photo.jpg',
      contentType: req.file.mimetype
    });

    const response = await fetch('https://api.luxand.cloud/photo/detect', {
      method:  'POST',
      headers: {
        'token': luxand_token,
        ...form.getHeaders()
      },
      body: form
    });

    const text = await response.text();
    console.log('Luxand response:', text.substring(0, 300));

    try {
      const data = JSON.parse(text);

      // Luxand returns faces array directly
      // Convert to Face++ compatible format for frontend
      if (Array.isArray(data) && data.length > 0) {
        const face = data[0];
        const x1 = face.x1 || face.rectangle?.left   || 0;
        const y1 = face.y1 || face.rectangle?.top    || 0;
        const x2 = face.x2 || (x1 + (face.rectangle?.width  || 100));
        const y2 = face.y2 || (y1 + (face.rectangle?.height || 100));
        const w  = x2 - x1;
        const h  = y2 - y1;

        console.log('Face found at:', x1, y1, w, h);

        return res.json({
          faces: [{
            face_rectangle: { left: x1, top: y1, width: w, height: h }
          }]
        });
      } else if (data.faces) {
        // Already in Face++ format
        return res.json(data);
      } else {
        console.log('No face detected by Luxand');
        return res.json({ faces: [] });
      }

    } catch(e) {
      return res.status(500).json({ error: 'Invalid Luxand response', raw: text.substring(0,200) });
    }

  } catch (err) {
    console.error('Face detect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Background removal (remove.bg) ───────────────────────────────
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  try {
    const removebg_key = process.env.REMOVEBG_API_KEY;

    if (!removebg_key) return res.status(400).json({ error: 'REMOVEBG_API_KEY not set in environment variables' });
    if (!req.file)     return res.status(400).json({ error: 'No image provided' });

    console.log('Removing background with remove.bg, image size:', req.file.size);

    const form = new FormData();
    form.append('image_file', req.file.buffer, {
      filename:    'photo.jpg',
      contentType: req.file.mimetype
    });
    form.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method:  'POST',
      headers: {
        'X-Api-Key': removebg_key,
        ...form.getHeaders()
      },
      body: form
    });

    console.log('remove.bg status:', response.status);
    const contentType = response.headers.get('content-type');
    console.log('remove.bg content-type:', contentType);

    if (response.ok && contentType && contentType.includes('image')) {
      const buffer = await response.buffer();
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', buffer.length);
      return res.send(buffer);
    } else {
      const errText = await response.text();
      console.error('remove.bg error:', errText);
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

// ── Test remove.bg ───────────────────────────────────────────────
app.get('/test-removebg', async (req, res) => {
  try {
    const key = process.env.REMOVEBG_API_KEY;
    if (!key) return res.json({ success: false, error: 'REMOVEBG_API_KEY not set' });

    const testRes = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg');
    const testBuf = await testRes.buffer();

    const form = new FormData();
    form.append('image_file', testBuf, { filename: 'test.jpg', contentType: 'image/jpeg' });
    form.append('size', 'preview');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': key, ...form.getHeaders() },
      body: form
    });

    const contentType = response.headers.get('content-type');
    if (response.ok && contentType && contentType.includes('image')) {
      const buf = await response.buffer();
      res.json({ success: true, message: 'remove.bg is working!', size_bytes: buf.length });
    } else {
      const err = await response.text();
      res.json({ success: false, status: response.status, error: err });
    }
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── Test Face++ detection ────────────────────────────────────────
app.get('/test-facepp', async (req, res) => {
  try {
    const facepp_key    = process.env.FACEPP_API_KEY;
    const facepp_secret = process.env.FACEPP_API_SECRET;

    if (!facepp_key || !facepp_secret) {
      return res.json({ success: false, error: 'Face++ keys not set in environment variables' });
    }

    // Use a simple test face image
    const testImgRes = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Gatto_europeo4.jpg/320px-Gatto_europeo4.jpg');
    const testBuf    = await testImgRes.buffer();

    const form = new FormData();
    form.append('api_key',           facepp_key);
    form.append('api_secret',        facepp_secret);
    form.append('image_file',        testBuf, { filename: 'test.jpg', contentType: 'image/jpeg' });
    form.append('return_attributes', 'none');

    const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
      method: 'POST',
      body:   form
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }

    res.json({
      success:      response.ok,
      status:       response.status,
      facepp_response: data,
      keys_set:     { key: !!facepp_key, secret: !!facepp_secret }
    });

  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── Test Luxand ───────────────────────────────────────────────────
app.get('/test-luxand', async (req, res) => {
  try {
    const token = process.env.LUXAND_TOKEN || '29d1d436ace7471f840540c0bba1cccc';
    const testRes = await fetch('https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400');
    const testBuf = await testRes.buffer();

    const form = new FormData();
    form.append('photo', testBuf, { filename: 'test.jpg', contentType: 'image/jpeg' });

    const response = await fetch('https://api.luxand.cloud/photo/detect', {
      method:  'POST',
      headers: { 'token': token, ...form.getHeaders() },
      body:    form
    });

    const text = await response.text();
    const data = JSON.parse(text);

    if (Array.isArray(data) && data.length > 0) {
      res.json({ success: true, message: 'Luxand is working!', faces_found: data.length, first_face: data[0] });
    } else {
      res.json({ success: false, response: data });
    }
  } catch(e) {
    res.json({ success: false, error: e.message });
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

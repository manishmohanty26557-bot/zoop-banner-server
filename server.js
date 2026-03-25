const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');
const path     = require('path');
const { generateBanner } = require('./banner-generator');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// ── Serve frontend ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'Zoop Banner Server v2',
  env_check: {
    cloudinary_name:   process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET',
    cloudinary_key:    process.env.CLOUDINARY_API_KEY    ? 'SET' : 'NOT SET',
    cloudinary_secret: process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET',
    groq:              process.env.GROQ_API_KEY           ? 'SET' : 'NOT SET',
    removebg:          process.env.REMOVEBG_API_KEY       ? 'SET' : 'NOT SET',
  }
}));

// ── Remove background via Cloudinary ────────────────────────────
async function removeBackgroundCloudinary(imageBuffer, mimeType) {
  const cloudName   = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey      = process.env.CLOUDINARY_API_KEY;
  const apiSecret   = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.log('Cloudinary not configured, falling back to remove.bg');
    return removeBackgroundRemoveBg(imageBuffer, mimeType);
  }

  // Step 1: Upload to Cloudinary
  const base64    = imageBuffer.toString('base64');
  const dataUri   = `data:${mimeType};base64,${base64}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const crypto = require('crypto');
  const paramsToSign = `background_removal=cloudinary&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const uploadForm = new FormData();
  uploadForm.append('file',                 dataUri);
  uploadForm.append('api_key',              apiKey);
  uploadForm.append('timestamp',            timestamp);
  uploadForm.append('signature',            signature);
  uploadForm.append('background_removal',   'cloudinary');

  const uploadRes  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body:   uploadForm
  });
  const uploadData = await uploadRes.json();

  if (!uploadData.secure_url) {
    console.log('Cloudinary upload failed:', uploadData);
    return removeBackgroundRemoveBg(imageBuffer, mimeType);
  }

  console.log('Cloudinary bg removed:', uploadData.secure_url);

  // Step 2: Download the bg-removed image
  // Cloudinary applies bg removal transformation
  const transformedUrl = uploadData.secure_url.replace('/upload/', '/upload/e_background_removal/');
  const imgRes  = await fetch(transformedUrl);
  if (imgRes.ok) {
    const buf = await imgRes.buffer();
    return buf;
  }

  // Fallback — return original
  return imageBuffer;
}

// ── Remove background via remove.bg (fallback) ───────────────────
async function removeBackgroundRemoveBg(imageBuffer, mimeType) {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) return imageBuffer;

  const form = new FormData();
  form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: mimeType });
  form.append('size', 'auto');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key, ...form.getHeaders() },
    body: form
  });

  if (res.ok) {
    const buf = await res.buffer();
    console.log('remove.bg success, size:', buf.length);
    return buf;
  }

  console.log('remove.bg failed:', res.status);
  return imageBuffer;
}

// ── Groq vision — analyze photo for face + accent color ──────────
async function analyzeWithGroq(imageBuffer) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { accentColor: null };

  try {
    const base64 = imageBuffer.toString('base64');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` }
            },
            {
              type: 'text',
              text: 'Look at this seller photo. Based on the dominant color of their outfit, suggest ONE hex color code for an accent color that would complement their outfit well on a banner. Return ONLY the hex code like #6B1A2A, nothing else.'
            }
          ]
        }],
        max_tokens: 20,
        temperature: 0.3
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const hexMatch = text.match(/#[0-9A-Fa-f]{6}/);
    const accentColor = hexMatch ? hexMatch[0] : null;
    console.log('Groq accent color:', accentColor);
    return { accentColor };
  } catch(e) {
    console.error('Groq error:', e.message);
    return { accentColor: null };
  }
}

// ── Main banner generation endpoint ──────────────────────────────
app.post('/generate-banner', upload.single('photo'), async (req, res) => {
  try {
    const {
      sellerName,
      sellerName2,
      category,
      timing,
      policyText,
      qrLink
    } = req.body;

    if (!sellerName) return res.status(400).json({ error: 'sellerName required' });

    console.log('Generating banner for:', sellerName);

    let photoBuffer = req.file?.buffer || null;
    let accentColor = null;

    if (photoBuffer) {
      const mimeType = req.file.mimetype || 'image/jpeg';

      // Step 1: Analyze with Groq for accent color
      console.log('Analyzing with Groq...');
      const groqResult = await analyzeWithGroq(photoBuffer);
      accentColor = groqResult.accentColor;

      // Step 2: Remove background with Cloudinary
      console.log('Removing background...');
      photoBuffer = await removeBackgroundCloudinary(photoBuffer, mimeType);
    }

    // Step 3: Generate banner
    console.log('Rendering banner...');
    const bannerBuffer = await generateBanner({
      sellerName,
      sellerName2,
      category,
      timing,
      policyText,
      qrLink,
      photoBuffer,
      accentColor
    });

    console.log('Banner generated, size:', bannerBuffer.length);

    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `attachment; filename="zoop-banner-${sellerName.replace(/\s+/g,'-')}.jpg"`);
    res.send(bannerBuffer);

  } catch(err) {
    console.error('Banner generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy endpoints (keep for backwards compat) ──────────────────
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const result = await removeBackgroundRemoveBg(req.file.buffer, req.file.mimetype);
    res.set('Content-Type', 'image/png');
    res.send(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/detect-face', upload.single('image'), async (req, res) => {
  try {
    const luxand_token = process.env.LUXAND_TOKEN || '29d1d436ace7471f840540c0bba1cccc';
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const form = new FormData();
    form.append('photo', req.file.buffer, { filename: 'photo.jpg', contentType: req.file.mimetype });
    const response = await fetch('https://api.luxand.cloud/photo/detect', {
      method: 'POST',
      headers: { 'token': luxand_token, ...form.getHeaders() },
      body: form
    });
    const text = await response.text();
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0) {
      const face = data[0];
      const x1 = face.x1 || 0, y1 = face.y1 || 0;
      const x2 = face.x2 || 100, y2 = face.y2 || 100;
      return res.json({ faces: [{ face_rectangle: { left: x1, top: y1, width: x2-x1, height: y2-y1 } }] });
    }
    res.json({ faces: [] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const { imgbb_key } = req.body;
    if (!imgbb_key || !req.file) return res.status(400).json({ error: 'Missing data' });
    const base64 = req.file.buffer.toString('base64');
    const form   = new FormData();
    form.append('image', base64);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, { method: 'POST', body: form });
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: 'Upload failed' });
    res.json({ url: data.data.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/generate-qr', async (req, res) => {
  try {
    const { link, imgbb_key } = req.body;
    if (!link || !imgbb_key) return res.status(400).json({ error: 'Missing data' });
    const qrRes    = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(link)}`);
    const qrBuffer = await qrRes.buffer();
    const base64   = qrBuffer.toString('base64');
    const form     = new FormData();
    form.append('image', base64);
    const uploadRes  = await fetch(`https://api.imgbb.com/1/upload?key=${imgbb_key}`, { method: 'POST', body: form });
    const uploadData = await uploadRes.json();
    if (!uploadData.success) return res.status(400).json({ error: 'QR upload failed' });
    res.json({ url: uploadData.data.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test-removebg', async (req, res) => {
  try {
    const key = process.env.REMOVEBG_API_KEY;
    if (!key) return res.json({ success: false, error: 'REMOVEBG_API_KEY not set' });
    res.json({ success: true, message: 'remove.bg configured' });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/test-luxand', async (req, res) => {
  res.json({ success: true, message: 'Luxand configured', token: process.env.LUXAND_TOKEN ? 'env' : 'default' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zoop Banner Server v2 running on port ${PORT}`));

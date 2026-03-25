const { createCanvas, loadImage, registerFont } = require('canvas');
const fetch    = require('node-fetch');
const FormData = require('form-data');

// ── Banner dimensions (exact) ─────────────────────────────────────
const W = 1548;
const H = 423;

// ── Floral arrangements — different per seller ────────────────────
const FLORAL_VARIANTS = [
  // Variant A — roses top-left heavy
  { topLeft: { x: -20, y: -20, scale: 1.1 }, topRight: { x: W-180, y: -30, scale: 0.85 },
    bottomLeft: { x: -30, y: H-170, scale: 1.0 }, bottomRight: { x: W-160, y: H-160, scale: 0.9 },
    topCenter: { x: W/2-80, y: -40, scale: 0.7 }, accent: '#6B1A2A' },
  // Variant B — balanced corners
  { topLeft: { x: -10, y: -10, scale: 0.9 }, topRight: { x: W-170, y: -20, scale: 1.0 },
    bottomLeft: { x: -20, y: H-160, scale: 0.85 }, bottomRight: { x: W-180, y: H-170, scale: 1.1 },
    topCenter: { x: W/2-70, y: -35, scale: 0.75 }, accent: '#7B2238' },
  // Variant C — right side heavy
  { topLeft: { x: -30, y: -15, scale: 0.8 }, topRight: { x: W-190, y: -25, scale: 1.15 },
    bottomLeft: { x: -15, y: H-155, scale: 0.9 }, bottomRight: { x: W-175, y: H-180, scale: 1.0 },
    topCenter: { x: W/2-90, y: -30, scale: 0.8 }, accent: '#5A1525' },
  // Variant D — top center heavy
  { topLeft: { x: -25, y: -25, scale: 1.0 }, topRight: { x: W-175, y: -15, scale: 0.9 },
    bottomLeft: { x: -10, y: H-165, scale: 1.0 }, bottomRight: { x: W-165, y: H-175, scale: 0.95 },
    topCenter: { x: W/2-100, y: -50, scale: 0.95 }, accent: '#6B1A2A' },
];

// ── Pick variant based on seller name hash ─────────────────────────
function pickVariant(sellerName) {
  let hash = 0;
  for (let i = 0; i < sellerName.length; i++) hash += sellerName.charCodeAt(i);
  return FLORAL_VARIANTS[hash % FLORAL_VARIANTS.length];
}

// ── Draw rounded rectangle ────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Draw a stylized rose ──────────────────────────────────────────
function drawRose(ctx, cx, cy, size, alpha = 1.0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  // Outer petals
  const petalColors = ['#e8869a','#d4607a','#f0a0b0','#c85070','#e87090','#d06080'];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = petalColors[i % petalColors.length];
    ctx.beginPath();
    ctx.ellipse(size * 0.42, 0, size * 0.38, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Inner petals
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#c03060';
    ctx.beginPath();
    ctx.ellipse(size * 0.2, 0, size * 0.22, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Center
  ctx.fillStyle = '#901840';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Leaves
  const leafColors = ['#5a8a40','#4a7a30','#6a9a50'];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.8;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = leafColors[i % leafColors.length];
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.ellipse(size * 0.65, 0, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// ── Draw small bud ────────────────────────────────────────────────
function drawBud(ctx, x, y, size, alpha = 0.8) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e8607a';
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.5, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a8a40';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.6, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Draw floral cluster ───────────────────────────────────────────
function drawFloralCluster(ctx, x, y, scale, variant) {
  const s = 55 * scale;
  drawRose(ctx, x + s*0.8, y + s*0.8, s, 0.92);
  drawRose(ctx, x + s*1.8, y + s*0.3, s*0.75, 0.85);
  drawRose(ctx, x + s*0.2, y + s*1.6, s*0.7, 0.8);
  drawBud(ctx, x + s*2.2, y + s*1.2, s*0.35, 0.75);
  drawBud(ctx, x + s*0.5, y + s*2.2, s*0.28, 0.7);

  // Leaves/stems
  ctx.save();
  ctx.strokeStyle = '#4a7a30';
  ctx.lineWidth = 2 * scale;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x + s*1.5, y + s*1.5);
  ctx.bezierCurveTo(x + s*2, y + s*2, x + s*2.5, y + s*2.5, x + s*3, y + s*1.8);
  ctx.stroke();
  ctx.restore();
}

// ── Draw damask background pattern ───────────────────────────────
function drawBackground(ctx) {
  // Cream base
  ctx.fillStyle = '#f8f0e8';
  ctx.fillRect(0, 0, W, H);

  // Subtle damask pattern
  ctx.fillStyle = 'rgba(200,170,140,0.06)';
  const ps = 80;
  for (let x = 0; x < W; x += ps) {
    for (let y = 0; y < H; y += ps) {
      ctx.save();
      ctx.translate(x + ps/2, y + ps/2);
      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(0, -ps*0.35);
      ctx.lineTo(ps*0.22, 0);
      ctx.lineTo(0, ps*0.35);
      ctx.lineTo(-ps*0.22, 0);
      ctx.closePath();
      ctx.fill();
      // Inner diamond
      ctx.fillStyle = 'rgba(200,170,140,0.04)';
      ctx.beginPath();
      ctx.moveTo(0, -ps*0.18);
      ctx.lineTo(ps*0.11, 0);
      ctx.lineTo(0, ps*0.18);
      ctx.lineTo(-ps*0.11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// ── Draw floral decorations using variant ────────────────────────
function drawFlorals(ctx, variant) {
  const v = variant;

  // Top-left cluster
  drawFloralCluster(ctx, v.topLeft.x, v.topLeft.y, v.topLeft.scale, v);

  // Top-right cluster
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-W, 0);
  drawFloralCluster(ctx, W - v.topRight.x - 200*v.topRight.scale, v.topRight.y, v.topRight.scale, v);
  ctx.restore();

  // Bottom-left cluster
  ctx.save();
  ctx.scale(1, -1);
  ctx.translate(0, -H);
  drawFloralCluster(ctx, v.bottomLeft.x, H - v.bottomLeft.y - 200*v.bottomLeft.scale, v.bottomLeft.scale, v);
  ctx.restore();

  // Bottom-right cluster
  ctx.save();
  ctx.scale(-1, -1);
  ctx.translate(-W, -H);
  drawFloralCluster(ctx, W - v.bottomRight.x - 200*v.bottomRight.scale, H - v.bottomRight.y - 200*v.bottomRight.scale, v.bottomRight.scale, v);
  ctx.restore();

  // Top center cluster (smaller)
  ctx.save();
  ctx.translate(W/2, 0);
  drawFloralCluster(ctx, v.topCenter.x, v.topCenter.y, v.topCenter.scale, v);
  ctx.restore();

  // Left edge roses
  drawRose(ctx, 25, H/2 - 30, 35, 0.75);
  drawRose(ctx, 35, H/2 + 50, 28, 0.65);

  // Right side roses (behind photo area)
  drawRose(ctx, W - 30, H/2, 32, 0.7);
}

// ── Draw QR code ──────────────────────────────────────────────────
async function drawQRCode(ctx, link, x, y, size) {
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size*2}x${size*2}&margin=4&data=${encodeURIComponent(link)}`;
    const res   = await fetch(qrUrl);
    const buf   = await res.buffer();
    const img   = await loadImage(buf);
    // White background for QR
    ctx.fillStyle = 'white';
    ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
    ctx.drawImage(img, x, y, size, size);
  } catch(e) {
    console.error('QR error:', e.message);
  }
}

// ── Draw seller photo ─────────────────────────────────────────────
async function drawSellerPhoto(ctx, photoBuffer, x, y, w, h) {
  try {
    const img = await loadImage(photoBuffer);

    // Calculate crop — show face + upper body centered
    const imgAR = img.width / img.height;
    const boxAR = w / h;

    let sx, sy, sw, sh;
    if (imgAR > boxAR) {
      // Image wider than box — crop sides
      sh = img.height;
      sw = sh * boxAR;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // Image taller than box — show top portion (face + body)
      sw = img.width;
      sh = sw / boxAR;
      sx = 0;
      sy = img.height * 0.05; // start slightly down to cut empty top
    }

    // Clip to box
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  } catch(e) {
    console.error('Photo error:', e.message);
  }
}

// ── Main banner generator ─────────────────────────────────────────
async function generateBanner({
  sellerName,
  sellerName2,
  category,
  timing,
  policyText,
  qrLink,
  photoBuffer,
  accentColor
}) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const variant = pickVariant(sellerName);
  const accent  = accentColor || variant.accent || '#6B1A2A';

  // ── 1. Background ───────────────────────────────────────────────
  drawBackground(ctx);

  // ── 2. Floral decorations ───────────────────────────────────────
  drawFlorals(ctx, variant);

  // ── 3. White content panel ──────────────────────────────────────
  const panelX = 155, panelY = 90, panelW = 1130, panelH = 250;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = 'rgba(255,255,255,0.88)';
  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  ctx.fill();
  ctx.restore();

  // ── 4. Seller photo (right side) ────────────────────────────────
  if (photoBuffer) {
    await drawSellerPhoto(ctx, photoBuffer, 940, 55, 330, 315);
  }

  // ── 5. Seller name ──────────────────────────────────────────────
  // Bold serif name
  ctx.fillStyle = '#2a1a1a';
  ctx.font      = 'bold 52px serif';
  ctx.textAlign = 'center';
  ctx.fillText(sellerName || 'SELLER', 310, 185);

  // Cursive second name
  ctx.fillStyle = accent;
  ctx.font      = 'italic bold 46px serif';
  ctx.fillText(sellerName2 || 'Name', 310, 240);
  ctx.textAlign = 'left';

  // ── 6. Category pill (tan bubble) ───────────────────────────────
  const catX = 470, catY = 105, catW = 270, catH = 75;
  ctx.fillStyle = '#c8b090';
  roundRect(ctx, catX, catY, catW, catH, 22);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font      = 'bold 22px sans-serif';
  ctx.textAlign = 'center';

  // Wrap category text
  const catWords = (category || 'Products').split(' ');
  if (catWords.length <= 3) {
    ctx.fillText(category, catX + catW/2, catY + catH/2 + 8);
  } else {
    const line1 = catWords.slice(0, Math.ceil(catWords.length/2)).join(' ');
    const line2 = catWords.slice(Math.ceil(catWords.length/2)).join(' ');
    ctx.fillText(line1, catX + catW/2, catY + catH/2 - 8);
    ctx.fillText(line2, catX + catW/2, catY + catH/2 + 18);
  }
  ctx.textAlign = 'left';

  // ── 7. Daily Live badge ──────────────────────────────────────────
  const badgeX = 468, badgeY = 198, badgeW = 275, badgeH = 105;
  ctx.fillStyle = accent;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 24);
  ctx.fill();

  // Wifi icon
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(badgeX + badgeW - 22, badgeY + 28, i * 8, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.font      = 'bold 20px sans-serif';
  ctx.fillText('DAILY LIVE', badgeX + badgeW/2 - 12, badgeY + 42);
  ctx.font      = 'bold 38px sans-serif';
  ctx.fillText(timing || '@8 PM', badgeX + badgeW/2 - 12, badgeY + 85);
  ctx.textAlign = 'left';

  // ── 8. Policy bar ───────────────────────────────────────────────
  const polX = 440, polY = 318, polW = 340, polH = 44;
  ctx.fillStyle = accent;
  roundRect(ctx, polX, polY, polW, polH, 14);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font      = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((policyText || 'NO EXCHANGE • NO RETURN').toUpperCase(), polX + polW/2, polY + 29);
  ctx.textAlign = 'left';

  // ── 9. QR code + Follow us on Zoop ──────────────────────────────
  if (qrLink) {
    await drawQRCode(ctx, qrLink, 182, 195, 95);
  }
  ctx.fillStyle = '#555';
  ctx.font      = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Follow us on Zoop', 230, 310);
  ctx.textAlign = 'left';

  // ── 10. Return as JPG buffer ─────────────────────────────────────
  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

module.exports = { generateBanner };

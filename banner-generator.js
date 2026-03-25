const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');

// ── Exact dimensions ──────────────────────────────────────────────
const W = 1548;
const H = 423;

// ── Floral variants — subtle differences per seller ───────────────
const FLORAL_VARIANTS = [
  { tlScale: 1.0,  trScale: 0.85, blScale: 0.9,  brScale: 1.0,  tcScale: 0.75 },
  { tlScale: 0.9,  trScale: 1.0,  blScale: 1.0,  brScale: 0.9,  tcScale: 0.8  },
  { tlScale: 1.1,  trScale: 0.9,  blScale: 0.85, brScale: 1.05, tcScale: 0.7  },
  { tlScale: 0.85, trScale: 1.05, blScale: 1.0,  brScale: 0.9,  tcScale: 0.85 },
];

function pickVariant(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % FLORAL_VARIANTS.length;
  return FLORAL_VARIANTS[h];
}

// ── Rounded rect ──────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ── Draw a proper rose ────────────────────────────────────────────
function drawRose(ctx, cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = (alpha || 1) * 0.9;
  ctx.translate(cx, cy);

  // Outer petals — 8 petals
  const outerColors = ['#E8789A','#D45878','#F0A0B8','#C84868','#E06888','#D05870','#E88098','#CC5070'];
  for (let i = 0; i < 8; i++) {
    const a = (i/8)*Math.PI*2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = outerColors[i];
    ctx.beginPath();
    ctx.ellipse(r*0.45, 0, r*0.42, r*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  // Mid petals
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2 + 0.3;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#C84070';
    ctx.beginPath();
    ctx.ellipse(r*0.28, 0, r*0.28, r*0.15, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  // Inner petals
  for (let i = 0; i < 5; i++) {
    const a = (i/5)*Math.PI*2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#A83060';
    ctx.beginPath();
    ctx.ellipse(r*0.14, 0, r*0.18, r*0.1, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  // Center
  ctx.fillStyle = '#882050';
  ctx.beginPath();
  ctx.arc(0, 0, r*0.1, 0, Math.PI*2);
  ctx.fill();

  // Leaves
  const leafAngles = [0.6, 2.2, 4.0];
  for (const la of leafAngles) {
    ctx.save();
    ctx.rotate(la);
    ctx.fillStyle = '#4A7A30';
    ctx.globalAlpha = (alpha||1)*0.75;
    ctx.beginPath();
    ctx.ellipse(r*0.75, 0, r*0.35, r*0.14, 0, 0, Math.PI*2);
    ctx.fill();
    // Leaf vein
    ctx.strokeStyle = '#3A6020';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(r*0.42, 0);
    ctx.lineTo(r*1.05, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ── Draw small bud ────────────────────────────────────────────────
function drawBud(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha || 0.8;
  // Petals
  ctx.fillStyle = '#E07090';
  ctx.beginPath();
  ctx.ellipse(x, y, r*0.5, r*0.7, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#C05070';
  ctx.beginPath();
  ctx.ellipse(x+r*0.1, y-r*0.1, r*0.35, r*0.5, -0.3, 0, Math.PI*2);
  ctx.fill();
  // Sepal
  ctx.fillStyle = '#4A7A30';
  ctx.beginPath();
  ctx.ellipse(x, y+r*0.65, r*0.25, r*0.2, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

// ── Draw a stem with leaves ───────────────────────────────────────
function drawStem(ctx, x1, y1, x2, y2, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha || 0.6;
  ctx.strokeStyle = '#5A8A35';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1+20, y1+30, x2-20, y2-30, x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ── Draw a floral cluster (corner) ───────────────────────────────
function drawCluster(ctx, cx, cy, scale) {
  const s = scale;
  // Main large rose
  drawRose(ctx, cx, cy, 55*s, 0.95);
  // Secondary roses
  drawRose(ctx, cx + 70*s, cy - 35*s, 42*s, 0.88);
  drawRose(ctx, cx - 40*s, cy + 65*s, 38*s, 0.85);
  drawRose(ctx, cx + 110*s, cy + 25*s, 32*s, 0.8);
  // Buds
  drawBud(ctx, cx + 45*s, cy + 80*s, 18*s, 0.8);
  drawBud(ctx, cx + 140*s, cy - 10*s, 14*s, 0.75);
  drawBud(ctx, cx - 15*s, cy - 55*s, 16*s, 0.7);
  // Stems
  drawStem(ctx, cx-10*s, cy+20*s, cx+40*s, cy+85*s, 0.55);
  drawStem(ctx, cx+60*s, cy, cx+110*s, cy+30*s, 0.5);
}

// ── Draw cream damask background ─────────────────────────────────
function drawBackground(ctx) {
  // Cream gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#FAF2E8');
  grad.addColorStop(0.5, '#F5EBE0');
  grad.addColorStop(1, '#F0E5D5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Damask pattern
  const ps = 70;
  for (let x = ps/2; x < W; x += ps) {
    for (let y = ps/2; y < H; y += ps) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(180,145,110,0.07)';
      // Diamond
      ctx.beginPath();
      ctx.moveTo(0, -28); ctx.lineTo(18, 0); ctx.lineTo(0, 28); ctx.lineTo(-18, 0);
      ctx.closePath(); ctx.fill();
      // Inner diamond
      ctx.fillStyle = 'rgba(180,145,110,0.05)';
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(9, 0); ctx.lineTo(0, 14); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();
      // Cross
      ctx.fillStyle = 'rgba(180,145,110,0.04)';
      ctx.fillRect(-2, -28, 4, 56);
      ctx.fillRect(-18, -2, 36, 4);
      ctx.restore();
    }
  }
}

// ── Draw all florals ──────────────────────────────────────────────
function drawFlorals(ctx, variant) {
  const v = variant;

  // TOP LEFT cluster
  drawCluster(ctx, -10, -10, v.tlScale);

  // TOP RIGHT cluster (mirror)
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  drawCluster(ctx, -10, -10, v.trScale);
  ctx.restore();

  // BOTTOM LEFT cluster (flip vertical)
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  drawCluster(ctx, -10, -10, v.blScale);
  ctx.restore();

  // BOTTOM RIGHT cluster (flip both)
  ctx.save();
  ctx.translate(W, H);
  ctx.scale(-1, -1);
  drawCluster(ctx, -10, -10, v.brScale);
  ctx.restore();

  // TOP CENTER small cluster
  ctx.save();
  ctx.translate(W/2 - 60, 0);
  const tc = v.tcScale;
  drawRose(ctx, 30, -20, 38*tc, 0.8);
  drawRose(ctx, 90, -30, 28*tc, 0.72);
  drawBud(ctx, 0, 30, 12*tc, 0.65);
  drawBud(ctx, 120, 10, 10*tc, 0.6);
  ctx.restore();

  // LEFT EDGE — extra roses along left side
  drawRose(ctx, 15, H*0.42, 28, 0.65);
  drawRose(ctx, 20, H*0.62, 22, 0.6);

  // RIGHT EDGE
  drawRose(ctx, W - 18, H*0.38, 25, 0.6);
}

// ── Draw the white content panel ─────────────────────────────────
function drawPanel(ctx) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur  = 20;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle   = 'rgba(255,255,255,0.9)';
  // Panel: starts at x=175, y=72, ends before photo area
  rr(ctx, 175, 72, 900, 280, 16);
  ctx.fill();
  ctx.restore();
}

// ── Draw seller photo ─────────────────────────────────────────────
async function drawPhoto(ctx, photoBuffer) {
  try {
    const img  = await loadImage(photoBuffer);
    const px   = 1110, py = 30, pw = 330, ph = H - 30;

    // Show top portion of image (face + body)
    const targetAR = pw / ph;
    const imgAR    = img.width / img.height;

    let sx, sy, sw, sh;
    if (imgAR > targetAR) {
      // Wider than needed — crop sides
      sh = img.height;
      sw = sh * targetAR;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // Taller than needed — show from top
      sw = img.width;
      sh = sw / targetAR;
      sx = 0;
      sy = 0;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
    ctx.restore();
  } catch(e) {
    console.error('Photo draw error:', e.message);
  }
}

// ── Draw QR code ──────────────────────────────────────────────────
async function drawQR(ctx, link, x, y, size) {
  try {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size*3}x${size*3}&margin=4&data=${encodeURIComponent(link)}`;
    const res = await fetch(url);
    const buf = await res.buffer();
    const img = await loadImage(buf);
    // White bg
    ctx.fillStyle = 'white';
    ctx.fillRect(x-3, y-3, size+6, size+6);
    ctx.drawImage(img, x, y, size, size);
  } catch(e) {
    console.error('QR error:', e.message);
    // Draw placeholder
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(x, y, size, size);
  }
}

// ── Main generate function ────────────────────────────────────────
async function generateBanner({ sellerName, sellerName2, category, timing, policyText, qrLink, photoBuffer, accentColor }) {
  const canvas  = createCanvas(W, H);
  const ctx     = canvas.getContext('2d');
  const variant = pickVariant(sellerName || 'seller');

  // Use accent color from Groq or fallback to maroon
  // Only accept dark red/maroon tones — reject greens/blues
  let accent = '#6B1A2A';
  if (accentColor) {
    const r = parseInt(accentColor.slice(1,3),16);
    const g = parseInt(accentColor.slice(3,5),16);
    const b = parseInt(accentColor.slice(5,7),16);
    // Only use if it's a dark warm tone (red/maroon dominant)
    if (r > g && r > b && r > 80) {
      accent = accentColor;
    }
  }

  // ── 1. Background ───────────────────────────────────────────────
  drawBackground(ctx);

  // ── 2. Florals ──────────────────────────────────────────────────
  drawFlorals(ctx, variant);

  // ── 3. White panel ──────────────────────────────────────────────
  drawPanel(ctx);

  // ── 4. Seller photo ─────────────────────────────────────────────
  if (photoBuffer) {
    await drawPhoto(ctx, photoBuffer);
  }

  // ── 5. Seller names ─────────────────────────────────────────────
  // Bold serif — "DECCOR" style
  ctx.fillStyle = '#1A1A1A';
  ctx.font      = 'bold 58px serif';
  ctx.textAlign = 'center';
  const name1   = sellerName || 'SELLER';
  ctx.fillText(name1, 310, 195);

  // Script style — "Diiva" style
  ctx.fillStyle = accent;
  ctx.font      = 'italic bold 50px serif';
  const name2   = sellerName2 || '';
  if (name2) {
    ctx.fillText(name2, 325, 255);
  }
  ctx.textAlign = 'left';

  // ── 6. Category bubble (tan pill) ───────────────────────────────
  const catX = 458, catY = 88, catW = 295, catH = 80;
  // Tan/beige color matching template
  ctx.fillStyle = '#C8A882';
  rr(ctx, catX, catY, catW, catH, 25);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font      = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  const catText = category || 'Products';
  // Auto wrap at 2 lines
  const words   = catText.split(' ');
  const mid     = Math.ceil(words.length / 2);
  if (words.length > 2) {
    ctx.fillText(words.slice(0, mid).join(' '), catX + catW/2, catY + catH/2 - 10);
    ctx.fillText(words.slice(mid).join(' '),    catX + catW/2, catY + catH/2 + 18);
  } else {
    ctx.fillText(catText, catX + catW/2, catY + catH/2 + 8);
  }
  ctx.textAlign = 'left';

  // ── 7. DAILY LIVE badge (maroon rounded) ────────────────────────
  const badgeX = 456, badgeY = 188, badgeW = 298, badgeH = 118;
  ctx.fillStyle = accent;
  rr(ctx, badgeX, badgeY, badgeW, badgeH, 28);
  ctx.fill();

  // Wifi signal icon (top right of badge)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  const wx = badgeX + badgeW - 28, wy = badgeY + 28;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(wx, wy + 8, i * 9, -Math.PI*0.75, -Math.PI*0.25);
    ctx.stroke();
  }
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(wx, wy + 8, 4, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.font      = 'bold 24px sans-serif';
  ctx.fillText('DAILY LIVE', badgeX + badgeW/2 - 14, badgeY + 50);
  ctx.font      = 'bold 44px sans-serif';
  ctx.fillText(timing || '@8 PM', badgeX + badgeW/2 - 14, badgeY + 100);
  ctx.textAlign = 'left';

  // ── 8. Policy bar ───────────────────────────────────────────────
  const polX = 428, polY = 325, polW = 355, polH = 48;
  ctx.fillStyle = accent;
  rr(ctx, polX, polY, polW, polH, 16);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font      = 'bold 19px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((policyText || 'NO EXCHANGE • NO RETURN').toUpperCase(), polX + polW/2, polY + 32);
  ctx.textAlign = 'left';

  // ── 9. QR Code + Follow us on Zoop ──────────────────────────────
  if (qrLink) {
    await drawQR(ctx, qrLink, 196, 205, 100);
  }
  ctx.fillStyle = '#555555';
  ctx.font      = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Follow us on Zoop', 248, 322);
  ctx.textAlign = 'left';

  // ── 10. Return JPG ──────────────────────────────────────────────
  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

module.exports = { generateBanner };

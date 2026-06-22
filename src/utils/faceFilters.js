// ============================================================
// src/utils/faceFilters.js
// Draws face filter overlays (dog ears, sunglasses, mask) onto
// a canvas using MediaPipe face landmark coordinates.
// All overlays are drawn with canvas primitives — no external
// image assets needed, keeps the bundle light and avoids
// asset-loading race conditions.
// ============================================================
import { LANDMARKS } from './faceTracking';

export const FACE_FILTERS = [
  { id: 'none', label: 'None' },
  { id: 'dog', label: 'Dog ears' },
  { id: 'glasses', label: 'Sunglasses' },
  { id: 'mask', label: 'Hero mask' },
];

function getPoint(landmarks, index, width, height) {
  const lm = landmarks[index];
  return { x: lm.x * width, y: lm.y * height };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Draws the selected face filter onto the canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - normalized [0,1] landmark points for one face
 * @param {number} width - canvas width in px
 * @param {number} height - canvas height in px
 * @param {string} filterId
 */
export function drawFaceFilter(ctx, landmarks, width, height, filterId) {
  if (filterId === 'none' || !landmarks) return;

  const leftEar = getPoint(landmarks, LANDMARKS.LEFT_EAR_TOP, width, height);
  const rightEar = getPoint(landmarks, LANDMARKS.RIGHT_EAR_TOP, width, height);
  const forehead = getPoint(landmarks, LANDMARKS.FOREHEAD_CENTER, width, height);
  const leftEyeOuter = getPoint(landmarks, LANDMARKS.LEFT_EYE_OUTER, width, height);
  const leftEyeInner = getPoint(landmarks, LANDMARKS.LEFT_EYE_INNER, width, height);
  const rightEyeOuter = getPoint(landmarks, LANDMARKS.RIGHT_EYE_OUTER, width, height);
  const rightEyeInner = getPoint(landmarks, LANDMARKS.RIGHT_EYE_INNER, width, height);
  const noseBridge = getPoint(landmarks, LANDMARKS.NOSE_BRIDGE, width, height);
  const chin = getPoint(landmarks, LANDMARKS.CHIN, width, height);
  const faceWidth = dist(leftEar, rightEar);

  if (filterId === 'dog') {
    drawDogEars(ctx, leftEar, rightEar, forehead, faceWidth);
    drawDogNose(ctx, noseBridge, faceWidth);
  } else if (filterId === 'glasses') {
    drawSunglasses(ctx, leftEyeOuter, leftEyeInner, rightEyeOuter, rightEyeInner, noseBridge, faceWidth);
  } else if (filterId === 'mask') {
    drawHeroMask(ctx, leftEar, rightEar, forehead, chin, faceWidth);
  }
}

function drawDogEars(ctx, leftEar, rightEar, forehead, faceWidth) {
  const earSize = faceWidth * 0.45;

  [{ point: leftEar, side: -1 }, { point: rightEar, side: 1 }].forEach(({ point, side }) => {
    const baseX = point.x;
    const baseY = forehead.y - faceWidth * 0.15;

    ctx.save();
    ctx.fillStyle = '#6B4226';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(
      baseX + side * earSize * 0.6, baseY - earSize * 0.9,
      baseX + side * earSize * 0.15, baseY - earSize * 1.3
    );
    ctx.quadraticCurveTo(
      baseX - side * earSize * 0.25, baseY - earSize * 0.6,
      baseX, baseY
    );
    ctx.closePath();
    ctx.fill();

    // Inner ear (lighter)
    ctx.fillStyle = '#C68B59';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY - earSize * 0.15);
    ctx.quadraticCurveTo(
      baseX + side * earSize * 0.35, baseY - earSize * 0.7,
      baseX + side * earSize * 0.1, baseY - earSize * 1.0
    );
    ctx.quadraticCurveTo(
      baseX - side * earSize * 0.1, baseY - earSize * 0.55,
      baseX, baseY - earSize * 0.15
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawDogNose(ctx, noseBridge, faceWidth) {
  const noseSize = faceWidth * 0.09;
  ctx.save();
  ctx.fillStyle = '#1A1A1A';
  ctx.beginPath();
  ctx.ellipse(noseBridge.x, noseBridge.y + faceWidth * 0.12, noseSize, noseSize * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSunglasses(ctx, leftOuter, leftInner, rightOuter, rightInner, noseBridge, faceWidth) {
  const lensRadius = faceWidth * 0.16;
  const leftCenter = { x: (leftOuter.x + leftInner.x) / 2, y: (leftOuter.y + leftInner.y) / 2 };
  const rightCenter = { x: (rightOuter.x + rightInner.x) / 2, y: (rightOuter.y + rightInner.y) / 2 };

  ctx.save();
  ctx.fillStyle = 'rgba(10,10,15,0.92)';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(2, faceWidth * 0.012);

  [leftCenter, rightCenter].forEach(center => {
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, lensRadius, lensRadius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Bridge connecting the two lenses
  ctx.beginPath();
  ctx.moveTo(leftCenter.x + lensRadius * 0.7, leftCenter.y);
  ctx.lineTo(rightCenter.x - lensRadius * 0.7, rightCenter.y);
  ctx.stroke();

  // Subtle highlight for a glossy look
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  [leftCenter, rightCenter].forEach(center => {
    ctx.beginPath();
    ctx.ellipse(center.x - lensRadius * 0.3, center.y - lensRadius * 0.3, lensRadius * 0.3, lensRadius * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHeroMask(ctx, leftEar, rightEar, forehead, chin, faceWidth) {
  const maskTop = forehead.y - faceWidth * 0.05;
  const maskBottom = (forehead.y + chin.y) / 2;
  const maskWidth = faceWidth * 1.05;
  const centerX = (leftEar.x + rightEar.x) / 2;

  ctx.save();
  const gradient = ctx.createLinearGradient(centerX - maskWidth / 2, maskTop, centerX + maskWidth / 2, maskBottom);
  gradient.addColorStop(0, '#5B3FE0');
  gradient.addColorStop(1, '#241456');
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(centerX - maskWidth / 2, maskTop + (maskBottom - maskTop) * 0.3);
  ctx.quadraticCurveTo(centerX - maskWidth * 0.45, maskTop - faceWidth * 0.05, centerX, maskTop - faceWidth * 0.02);
  ctx.quadraticCurveTo(centerX + maskWidth * 0.45, maskTop - faceWidth * 0.05, centerX + maskWidth / 2, maskTop + (maskBottom - maskTop) * 0.3);
  ctx.quadraticCurveTo(centerX + maskWidth * 0.4, maskBottom + faceWidth * 0.08, centerX, maskBottom - faceWidth * 0.02);
  ctx.quadraticCurveTo(centerX - maskWidth * 0.4, maskBottom + faceWidth * 0.08, centerX - maskWidth / 2, maskTop + (maskBottom - maskTop) * 0.3);
  ctx.closePath();
  ctx.fill();

  // Eye cutouts (white almond shapes) so the wearer's eyes still show through visually
  const eyeY = maskTop + (maskBottom - maskTop) * 0.55;
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(centerX + side * faceWidth * 0.22, eyeY, faceWidth * 0.13, faceWidth * 0.07, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}

// ============================================================
// cloudinaryService.js — Unsigned uploads to Cloudinary
// Used for chat media (photos/videos/files) and group avatars,
// since Firebase Storage requires the Blaze (paid) plan.
// ============================================================

const CLOUD_NAME = 'dhmhoixso';
const UPLOAD_PRESET = 'vartalap_avatars';

// Cloudinary's /auto/upload endpoint accepts images, videos, AND raw
// files (PDFs, docs, etc.) all through one endpoint — it auto-detects
// the resource type from the file itself.
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

/**
 * Uploads a file to Cloudinary and returns its public URL.
 * @param {File} file
 * @returns {Promise<{ url: string, publicId: string, resourceType: string }>}
 */
export async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Cloudinary upload failed (${response.status})`);
  }

  const data = await response.json();
  return {
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type, // 'image' | 'video' | 'raw'
  };
}

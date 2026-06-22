// ============================================================
// src/utils/cloudinary.js
// Free media hosting via Cloudinary's unsigned upload.
// No backend, no secret keys exposed, free tier (25GB/month).
// ============================================================

const CLOUD_NAME = 'dhmhoixso';
const UPLOAD_PRESET = 'vartalap_avatars';

/**
 * Generic upload to Cloudinary.
 * @param {File|Blob} file
 * @param {'image'|'video'} resourceType
 * @param {string} folder
 * @param {number} maxSizeMB
 */
async function uploadToCloudinary(file, resourceType, folder, maxSizeMB) {
  if (!file) throw new Error('No file provided');
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error(`File must be under ${maxSizeMB}MB`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Upload failed: ${errText}`);
  }

  const data = await response.json();
  return data.secure_url;
}

/**
 * Uploads an image file to Cloudinary and returns its public URL.
 * @param {File} file - The image file selected by the user.
 * @returns {Promise<string>} The secure URL of the uploaded image.
 */
export async function uploadAvatar(file) {
  return uploadToCloudinary(file, 'image', 'vartalap_avatars', 5);
}

/**
 * Uploads a captured/filtered photo (from the camera) to Cloudinary.
 * @param {Blob} blob - JPEG/PNG blob from canvas capture.
 */
export async function uploadChatImage(blob) {
  return uploadToCloudinary(blob, 'image', 'vartalap_chat_media', 10);
}

/**
 * Uploads a captured video clip (from the camera) to Cloudinary.
 * @param {Blob} blob - WebM/MP4 blob from MediaRecorder.
 */
export async function uploadChatVideo(blob) {
  return uploadToCloudinary(blob, 'video', 'vartalap_chat_media', 50);
}

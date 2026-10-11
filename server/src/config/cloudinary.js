import { v2 as cloudinary } from 'cloudinary';

/**
 * Initialise the Cloudinary SDK using env vars.
 * Called once at server startup.
 */
export function initCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.warn(
      '[Cloudinary] Credentials not configured — file uploads will be unavailable.'
    );
    return;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  console.log('[Cloudinary] Configured successfully.');
}

export { cloudinary };

import { google } from 'googleapis';

let driveInstance: ReturnType<typeof google.drive> | null = null;

export function getDrive() {
  if (driveInstance) return driveInstance;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/api/auth/google/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  driveInstance = google.drive({ version: 'v3', auth: oauth2Client });
  return driveInstance;
}

export function getRootFolderId() {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || '';
}
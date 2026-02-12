import {Paths, File, Directory} from 'expo-file-system';

const musicDir = new Directory(Paths.document, 'music');

export function ensureMusicDir() {
  if (!musicDir.exists) {
    musicDir.create({intermediates: true});
  }
}

export function copyToMusicDir(sourceUri: string, fileName: string) {
  ensureMusicDir();
  const source = new File(sourceUri);
  const dest = new File(musicDir, fileName);
  source.copy(dest);
}

export async function downloadToMusicDir(
  url: string,
  fileName: string,
): Promise<{type: string} | null> {
  ensureMusicDir();
  const dest = new File(musicDir, fileName);

  // Decode first to prevent double-encoding (%20 → %2520)
  const decodedUrl = decodeURI(url);
  const response = await fetch(decodedUrl);
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? '';
  const buffer = new Uint8Array(await response.arrayBuffer());
  dest.write(buffer);

  return {type: contentType};
}

export function deleteFromMusicDir(fileName: string) {
  const file = new File(musicDir, fileName);
  if (file.exists) {
    file.delete();
  }
}

export function getMusicFileUri(fileName: string) {
  return new File(musicDir, fileName).uri;
}

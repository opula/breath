import { ConfigServer } from "react-native-nitro-http-server";
import { Paths, File, Directory } from "expo-file-system";
import uuid from "react-native-uuid";
import { copyToMusicDir, ensureMusicDir } from "../../utils/musicFiles";
import { MusicFile } from "../../types/music";
import { getUploadPageHtml, CloudProviderConfig } from "./uploadPageHtml";

const AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "aac",
  "ogg",
  "flac",
  "opus",
];

const PORT = 8080;
const tempDir = new Directory(Paths.cache, "wifi-upload-temp");

function ensureTempDir() {
  if (!tempDir.exists) {
    tempDir.create({ intermediates: true });
  }
}

function cleanTempDir() {
  if (tempDir.exists) {
    tempDir.delete();
  }
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

interface FileTransferCallbacks {
  onFileReceived: (file: MusicFile) => void;
}

interface FileTransferOptions {
  callbacks: FileTransferCallbacks;
  cloud?: CloudProviderConfig;
}

export async function startFileTransferServer(
  options: FileTransferOptions,
): Promise<ConfigServer> {
  const uploadPageHtml = getUploadPageHtml(options.cloud);
  ensureTempDir();
  ensureMusicDir();

  const server = new ConfigServer();

  await server.start(
    PORT,
    async (request) => {
      if (request.method === "GET" && (request.path === "/" || request.path === "")) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: uploadPageHtml,
        };
      }

      if (request.method === "POST" && request.path === "/upload") {
        const uploadedPath = request.headers["x-uploaded-file-path"];
        if (!uploadedPath) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "No file received" }),
          };
        }

        const originalName =
          request.headers["x-original-filename"] || "unknown.mp3";
        const ext = getExtension(originalName);

        if (!AUDIO_EXTENSIONS.includes(ext)) {
          // Clean up temp file
          const tempFile = new File(uploadedPath);
          if (tempFile.exists) tempFile.delete();
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Unsupported file type. Use: " + AUDIO_EXTENSIONS.join(", "),
            }),
          };
        }

        const id = uuid.v4() as string;
        const fileName = `${id}.${ext}`;

        try {
          copyToMusicDir(uploadedPath, fileName);

          // Clean up temp file
          const tempFile = new File(uploadedPath);
          if (tempFile.exists) tempFile.delete();

          const musicFile: MusicFile = {
            id,
            name: originalName,
            fileName,
          };

          options.callbacks.onFileReceived(musicFile);

          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true, name: originalName }),
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to save file" }),
          };
        }
      }

      return { statusCode: 404, body: "Not found" };
    },
    {
      mounts: [
        {
          type: "upload",
          path: "/upload",
          temp_dir: tempDir.uri.replace("file://", ""),
        },
      ],
    },
    "0.0.0.0",
  );

  return server;
}

export async function stopFileTransferServer(
  server: ConfigServer,
): Promise<void> {
  if (server.isRunning()) {
    await server.stop();
  }
  cleanTempDir();
}

export type MusicFile = {
  id: string; // uuid
  name: string; // display name ("Rain Sounds.mp3")
  fileName: string; // on-disk filename ("a1b2c3d4.mp3") — unique per file
};

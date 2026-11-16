// Índice de artistas y álbumes a partir de la biblioteca (mismas reglas que el servidor).
import { isPlayable } from "../api";
import { normalize } from "./format";

// "Feid, El Americano 4KT" -> ["Feid", "El Americano 4KT"]; "2Pac ft. Bob Marley" -> ["2Pac", "Bob Marley"].
// No separa "&" ni "y" (romperían nombres como "Simon & Garfunkel").
const SPLIT = /\s*(?:,|;|\s\/\s|\s+(?:feat\.?|ft\.?|featuring|x|vs\.?)\s+)\s*/i;

export const splitArtists = (artist) =>
  (artist || "")
    .split(SPLIT)
    .map((a) => a.trim().replace(/^-+|-+$/g, "").trim())
    .filter(Boolean);

/** Clave estable de un artista: minúsculas, sin tildes ni signos. */
export const artistKey = (name) =>
  normalize(name || "")
    .replace(/[^0-9a-z]+/g, " ")
    .trim();

export const albumKey = (song) => `${artistKey(song.album)}~${artistKey(splitArtists(song.artist)[0] || "")}`;

function bestSpelling(counts) {
  // con tildes antes que sin ellas, no todo en mayúsculas, y si empatan la más usada
  const accented = (n) => [...n].some((ch) => ch.charCodeAt(0) > 127 && /\p{L}/u.test(ch));
  const score = (n) => [accented(n) ? 1 : 0, n === n.toUpperCase() && n.length > 3 ? 0 : 1, counts.get(n)];
  return [...counts.keys()].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2];
  })[0];
}

/** Map clave -> { key, name, songs, main (canciones como artista principal), plays, liked, lastPlayed } */
export function buildArtistIndex(songs) {
  const map = new Map();
  for (const s of songs) {
    splitArtists(s.artist).forEach((name, i) => {
      const key = artistKey(name);
      if (!key) return;
      let a = map.get(key);
      if (!a) {
        a = { key, names: new Map(), songs: [], main: 0, plays: 0, liked: 0, lastPlayed: "" };
        map.set(key, a);
      }
      a.names.set(name, (a.names.get(name) || 0) + 1);
      a.songs.push(s);
      if (i === 0) a.main += 1;
      a.plays += s.play_count || 0;
      if (s.liked) a.liked += 1;
      if ((s.last_played_at || "") > a.lastPlayed) a.lastPlayed = s.last_played_at;
    });
  }
  for (const a of map.values()) a.name = bestSpelling(a.names);
  return map;
}

/** Map clave -> { key, title, artist, songs } (solo canciones con álbum en sus datos). */
export function buildAlbumIndex(songs) {
  const map = new Map();
  for (const s of songs) {
    if (!s.album?.trim()) continue;
    const key = albumKey(s);
    let al = map.get(key);
    if (!al) {
      al = { key, title: s.album.trim(), artist: splitArtists(s.artist)[0] || null, songs: [] };
      map.set(key, al);
    }
    al.songs.push(s);
  }
  for (const al of map.values()) {
    al.songs.sort((a, b) => (a.track_no ?? 999) - (b.track_no ?? 999) || a.title.localeCompare(b.title, "es"));
  }
  return map;
}

/** Canción que representa a un artista o álbum: la más escuchada que tenga archivo. */
export const coverSongOf = (songs) =>
  [...songs].sort((a, b) => isPlayable(b) - isPlayable(a) || (b.play_count || 0) - (a.play_count || 0))[0];

import { describe, expect, it } from "vitest";
import { artistKey, buildAlbumIndex, buildArtistIndex, splitArtists } from "./artists";

describe("artistas", () => {
  it("separa colaboraciones sin romper nombres con &", () => {
    expect(splitArtists("Feid, El Americano 4KT, Pirlo")).toEqual(["Feid", "El Americano 4KT", "Pirlo"]);
    expect(splitArtists("2Pac ft. Bob Marley")).toEqual(["2Pac", "Bob Marley"]);
    expect(splitArtists("Simon & Garfunkel")).toEqual(["Simon & Garfunkel"]);
    expect(artistKey("Willie Colón")).toBe(artistKey("WILLIE COLON"));
  });

  it("agrupa escrituras distintas y cuenta colaboraciones", () => {
    const songs = [
      { id: 1, artist: "Willie Colón", play_count: 3 },
      { id: 2, artist: "Willie Colon", play_count: 1 },
      { id: 3, artist: "Héctor Lavoe ft. Willie Colon", play_count: 0, liked: true },
    ];
    const idx = buildArtistIndex(songs);
    const w = idx.get(artistKey("Willie Colon"));
    expect(w.name).toBe("Willie Colón");
    expect(w.songs.map((s) => s.id)).toEqual([1, 2, 3]);
    expect([w.main, w.plays]).toEqual([2, 4]);
  });

  it("álbumes ordenados por número de pista", () => {
    const idx = buildAlbumIndex([
      { id: 1, title: "B", album: "Siembra", artist: "Willie Colón", track_no: 2 },
      { id: 2, title: "A", album: "Siembra", artist: "Willie Colón & Rubén Blades", track_no: 1 },
      { id: 3, title: "C", album: null, artist: "X" },
    ]);
    expect(idx.size).toBe(2);
    const siembra = [...idx.values()].find((a) => a.artist === "Willie Colón");
    expect(siembra.songs.map((s) => s.id)).toEqual([1]);
  });
});

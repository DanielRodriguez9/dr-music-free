import { describe, expect, it } from "vitest";
import { activeLineIndex, hasLyrics, lyricsKey, lyricsPath, nextTextLine } from "./lyrics";

const lines = [
  { t: 10, text: "Uno" },
  { t: 15, text: "" },
  { t: 20, text: "Dos" },
  { t: 30, text: "Tres" },
];

describe("activeLineIndex", () => {
  it("antes de la primera línea no hay ninguna", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex([], 50)).toBe(-1);
    expect(activeLineIndex(null, 50)).toBe(-1);
  });
  it("elige la última línea que ya empezó (con un poco de adelanto)", () => {
    expect(activeLineIndex(lines, 9.8)).toBe(0); // 0,25 s antes
    expect(activeLineIndex(lines, 12)).toBe(0);
    expect(activeLineIndex(lines, 20)).toBe(2);
    expect(activeLineIndex(lines, 29.5)).toBe(2);
    expect(activeLineIndex(lines, 500)).toBe(3);
  });
});

describe("nextTextLine", () => {
  it("salta los huecos sin texto", () => {
    expect(nextTextLine(lines, 0)).toBe(2);
    expect(nextTextLine(lines, -1)).toBe(0);
    expect(nextTextLine(lines, 3)).toBe(-1);
  });
});

describe("lyricsKey / lyricsPath", () => {
  it("canción de la biblioteca", () => {
    const song = { id: 7, youtube_id: "oWBf9hfW_4Y", title: "La Rebelión" };
    expect(lyricsKey(song)).toBe("oWBf9hfW_4Y");
    expect(lyricsKey({ id: 7 })).toBe("song-7");
    expect(lyricsPath(song)).toBe("/lyrics/song/7?fetch=1");
    expect(lyricsPath(song, false)).toBe("/lyrics/song/7?fetch=0");
  });
  it("canción en línea", () => {
    const song = { id: "yt:oWBf9hfW_4Y", youtube_id: "oWBf9hfW_4Y", title: "La Rebelión", artist: "Joe Arroyo", duration: 284.6 };
    expect(lyricsPath(song)).toBe("/lyrics/online/oWBf9hfW_4Y?title=La+Rebeli%C3%B3n&fetch=1&artist=Joe+Arroyo&duration=285");
    expect(lyricsPath(null)).toBe(null);
  });
  it("hasLyrics", () => {
    expect(hasLyrics({ status: "synced" })).toBe(true);
    expect(hasLyrics({ status: "plain" })).toBe(true);
    expect(hasLyrics({ status: "none" })).toBe(false);
    expect(hasLyrics(null)).toBe(false);
  });
});

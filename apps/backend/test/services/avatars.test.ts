import { describe, expect, test } from "bun:test";
import { reencodeAvatar, sniffImage } from "../../src/services/avatars";
import { png, pngClaiming } from "../images";

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("sniffImage", () => {
  test("reads the format from the first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImage(png(1, 1))).toBe("png");
    expect(sniffImage(ascii("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("webp");
  });

  test("refuses everything else, whatever it is called", () => {
    expect(sniffImage(ascii("GIF89a"))).toBeNull();
    expect(sniffImage(ascii("%PDF-1.7"))).toBeNull();
    expect(sniffImage(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(ascii("RIFF\x10\x00\x00\x00WAVEfmt "))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("reencodeAvatar", () => {
  test("a large image becomes a WebP of at most 256 px, keeping its shape", async () => {
    const out = await reencodeAvatar(png(600, 400));
    expect(sniffImage(out)).toBe("webp");
    const { width, height, format } = await new Bun.Image(out).metadata();
    expect({ width, height, format }).toEqual({
      width: 256,
      height: 171,
      format: "webp",
    });
  });

  test("a small image is not enlarged", async () => {
    const { width, height } = await new Bun.Image(
      await reencodeAvatar(png(100, 80)),
    ).metadata();
    expect({ width, height }).toEqual({ width: 100, height: 80 });
  });

  test("metadata in the upload does not survive", async () => {
    const out = await reencodeAvatar(png(64, 64, { text: "GPS 51.5007 -0.1246" }));
    expect(Buffer.from(out).toString("latin1")).not.toContain("51.5007");
  });

  test("a file that only starts like an image is refused", async () => {
    const broken = new Uint8Array([...png(8, 8).slice(0, 40), ...ascii("not really")]);
    await expect(reencodeAvatar(broken)).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(reencodeAvatar(ascii("GIF89a....."))).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  test("an image claiming a huge canvas is refused before it is decoded", async () => {
    // 64 megapixels: under Bun's own default cap, over ours.
    const error = await reencodeAvatar(pngClaiming(8_000, 8_000)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: "validation_error",
      cause: { code: "ERR_IMAGE_TOO_MANY_PIXELS" },
    });
  });
});

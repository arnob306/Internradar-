/** WCAG 2.x contrast ratio between two hex colours, from 1 (identical) to 21 (black on white). */

function parseHex(hex: string): readonly [number, number, number] {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const parts = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1);
  if (parts === undefined || parts.length !== 3) {
    throw new Error(`not a hex colour: ${hex}`);
  }
  const [red = "00", green = "00", blue = "00"] = parts;
  return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16)];
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = parseHex(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

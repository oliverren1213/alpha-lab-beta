const encoder = new TextEncoder();

export async function createGuestToken(secret: string, id = crypto.randomUUID()) {
  return { ownerId: `guest_${id}`, token: `${id}.${await signature(secret, id)}` };
}

export async function verifyGuestToken(secret: string, token: string) {
  const [id, supplied, extra] = token.split(".");
  if (extra || !id || !supplied || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = await signature(secret, id);
  if (expected.length !== supplied.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0 ? `guest_${id}` : null;
}

async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

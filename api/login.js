import { checkPassword, sessionToken, COOKIE, readJson, setupError } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (setupError(res)) return;
  const { password } = await readJson(req);
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 900)); // frena intentos por fuerza bruta
    return res.status(401).json({ error: "wrong_password" });
  }
  res.setHeader("Set-Cookie", `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 90}`);
  res.status(200).json({ ok: true });
}

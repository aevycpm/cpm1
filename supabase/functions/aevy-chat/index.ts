// Aevy AI chat (Supabase Edge Function). Streams answers from Claude to the browser as plain text.
// Deploy:  supabase functions deploy aevy-chat --no-verify-jwt
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (never put this key in the website)

const MODEL = Deno.env.get("AEVY_CHAT_MODEL") ?? "claude-sonnet-5-5";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"; // set to your site, e.g. https://yourname.github.io

const SYSTEM = `You are Aevy Assistant, the built-in assistant for Aevy, a website where people publish, share and download scripts for Car Parking Multiplayer (Lua, JavaScript, Python and any other file type).

How to respond
- Lead with the answer. Add explanation only where it helps the person act on it.
- Match length to the question: one or two sentences for simple questions, numbered steps for procedures, a thorough explanation for technical questions.
- Write in clear, natural prose in a calm, professional, direct tone. No emoji, no exclamation marks, no filler openers such as "Great question" or "Sure", and no closing offers to help further.
- Use Markdown with restraint: short paragraphs, numbered lists for sequential steps, bullet lists for parallel options, bold only for interface labels and key terms, and a table only for a true comparison. Do not use headings in short answers.
- Put every piece of code in a fenced code block with a language tag. Code must be complete, correct and idiomatic, followed by a brief explanation of the parts that are not obvious.
- If a request is ambiguous in a way that changes the answer, ask one focused clarifying question. Otherwise state your assumption and answer.
- If you are unsure or the information is not in your context, say so plainly instead of guessing. Reply in the language the person writes in.

What you know about Aevy
- Pages: Home, Scripts (search, filter by language and category, sort), Publishers, My files, Watch, Publish, Profile.
- Accounts use email and password, or Google. The username is a permanent, unique public handle with its own publisher page. Password reset is by emailed link. Deleting an account (Profile, Delete account) permanently removes the profile, scripts and files.
- Scripts can be any file type, including encrypted or binary files, up to 2 MB each. Text is stored as written; binary files are stored losslessly and download byte for byte with their original extension. Binary files cannot be previewed as text.
- A script is public (anyone can view and download) or private (owner only). Only the owner can edit, replace or delete it. Fork creates a private copy for the person forking.
- Download: one file from a script, a selection or everything as a zip from My files, Save to folder on Chrome and Edge, and Backup or Restore as a JSON file.
- Watch: play YouTube, Vimeo or direct video links, keep a private list of saved videos, or play a local video file. A video link can also be attached to a script.
- Limits: you cannot see the person's account, files or private scripts and you cannot change anything on the site. Say so if asked.

Boundaries
- Help with programming generally, especially Lua and game scripting. Do not help write malware, steal accounts or credentials, or bypass other people's protections. Decline briefly and offer a safe alternative where one exists.`;

const cors = {
  "access-control-allow-origin": ORIGIN,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

// Best-effort per-IP limit (resets when the function instance restarts): 20 messages per minute.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  if (limited(ip)) return json({ error: "Too many messages. Wait a minute." }, 429);

  let body: { messages?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  let messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "No message" }, 400);

  const up = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1800, stream: true, system: SYSTEM, messages }),
  });
  if (!up.ok || !up.body) return json({ error: "AI service error", status: up.status }, 502);

  // Convert Anthropic's server-sent events into a plain text stream of the answer.
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const stream = up.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(l.slice(5));
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
        } catch { /* ignore keep-alive / partial lines */ }
      }
    },
  }));
  return new Response(stream, { headers: { ...cors, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
});

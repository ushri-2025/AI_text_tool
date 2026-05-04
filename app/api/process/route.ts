import { NextResponse } from "next/server";

/* ✅ FORCE NODE */
export const runtime = "nodejs";

/* ---------- QUEUE ---------- */
let activeRequests = 0;
const MAX_CONCURRENT = 2;
const queue: Array<() => void> = [];

async function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }

  await new Promise<void>((resolve) => {
    queue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  }
}

/* ---------- CLEAN ---------- */
function clean(text: string | null): string | null {
  if (!text) return null;

  return text
    .replace(/\b(undefined|null)\b/gi, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- BAD ---------- */
function isBad(text: string | null): boolean {
  if (!text) return true;
  if (text.length < 5) return true;
  if (/\b(undefined|null)\b/i.test(text)) return true;
  return false;
}

/* ---------- FORMAT ---------- */
function formatOutput(text: string, mode: string): string {
  if (!text) return text;

  if (mode === "write") {
    return text
      .replace(/\.\s+/g, ".\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return text;
}

/* ---------- DELAY ---------- */
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ---------- GEMINI ---------- */
async function gemini(prompt: string): Promise<string | null> {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.log("❌ No API key");
      return null;
    }
    const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,    
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a professional AI writing assistant.

STRICT RULES:
- ALWAYS rewrite the text
- Fix grammar, clarity, tone
- Make output natural and fluent
- For write mode: generate NEW content

Return ONLY final output.

${prompt}`,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.log("❌ GEMINI ERROR:", err);
      return null;
    }

    const data = await res.json();

    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) return null;

    return clean(raw);

  } catch (err) {
    console.log("❌ Fetch error:", err);
    return null;
  }
}

/* ---------- PROMPT ---------- */
function buildPrompt(
  input: string,
  mode: string,
  tone?: string,
  retry?: boolean
): string {
  let base = "";

  if (mode === "autofix") {
    base = `Fix grammar, spelling, punctuation.

Text:
${input}`;
  }

  else if (mode === "improve") {
    base = `Rewrite in ${tone} tone.

Text:
${input}`;
  }

  else if (mode === "humanize") {
    base = `Make this sound natural.

Text:
${input}`;
  }

  else if (mode === "write") {
    base = `Write content (max 180 words).

Instruction:
${input}`;
  }

  if (retry) {
    base += `\nRewrite better with improved clarity.`;
  }

  return base;
}

/* ---------- MAIN ---------- */
export async function POST(req: Request): Promise<Response> {
  await acquireSlot();

  try {
    const body = await req.json();

    const input = body?.input || "";
    const mode = body?.mode || "autofix";
    const tone = body?.tone || "formal";
    const retry = body?.retry || false;

    if (!input.trim()) {
      return NextResponse.json({ output: "Enter text." });
    }

    const prompt = buildPrompt(input, mode, tone, retry);

    let result = await gemini(prompt);

    if (
      result &&
      result.trim().toLowerCase() === input.trim().toLowerCase()
    ) {
      await delay(200);
      result = await gemini(prompt);
    }

    if (isBad(result)) {
      return NextResponse.json({
        output: "Receiving many requests at once, try again later.",
      });
    }

    result = formatOutput(result as string, mode);

    return NextResponse.json({
      output: result || "",
    });

  } catch (err) {
    console.log("❌ Server error:", err);

    return NextResponse.json({
      output: "Receiving many requests at once, try again later.",
    });
  } finally {
    releaseSlot();
  }
}
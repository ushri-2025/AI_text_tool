import { NextResponse } from "next/server";

/* ---------- QUEUE SYSTEM ---------- */
let activeRequests = 0;
const MAX_CONCURRENT = 2;
const queue: (() => void)[] = [];

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
    next && next();
  }
}

/* ---------- CLEAN ---------- */
function clean(text: string | null) {
  if (!text || typeof text !== "string") return null;

  return text
    .replace(/\b(undefined|null)\b/gi, "") // ✅ undefined fixed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ") // ✅ spacing fixed
    .trim();
}

/* ---------- BAD ---------- */
function isBad(text: string | null) {
  if (!text) return true;
  if (text.length < 5) return true;
  if (/\b(undefined|null)\b/i.test(text)) return true;
  return false;
}

/* ---------- FORMAT ---------- */
function formatOutput(text: string, mode: string) {
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

/* ---------- OPENROUTER ---------- */
async function openrouter(prompt: string) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Return ONLY final text. No explanation. Maintain proper spacing.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;

    if (!raw || typeof raw !== "string") return null;

    return clean(raw);
  } catch {
    return null;
  }
}

/* ---------- GEMINI ---------- */
async function gemini(prompt: string) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw || typeof raw !== "string") return null;

    return clean(raw);
  } catch {
    return null;
  }
}

/* ---------- SMART PROMPT ---------- */
function buildPrompt(
  input: string,
  mode: string,
  tone?: string,
  retry?: boolean
) {
  let base = "";

  if (mode === "autofix") {
    base = `Correct grammar perfectly. Return only corrected text.\n${input}`;
  } else if (mode === "improve") {
    base = `Rewrite in ${tone} tone with clarity.\n${input}`;
  } else if (mode === "humanize") {
    base = `Make this natural and conversational.\n${input}`;
  } else if (mode === "write") {
    base = `
Write high-quality content.

Rules:
- Default length: within 180 words
- Follow user instruction if longer required

Formatting:
- Proper paragraphs
- Clean spacing

Strict:
- No explanation
- No labels

Text:
${input}
`;
  }

  /* ---------- SMART RETRY ---------- */
  if (retry) {
    if (mode === "autofix") {
      base += `
Correct again more strictly.
Do NOT rephrase. Only fix grammar.`;
    } else if (mode === "humanize") {
      base += `
Make it sound more natural and human.`;
    } else if (mode === "improve") {
      base += `
Rewrite with slight tone variation.`;
    } else if (mode === "write") {
      base += `
Rewrite with a different structure and flow.`;
    }
  }

  return base;
}

/* ---------- MAIN ---------- */
export async function POST(req: Request) {
  await acquireSlot(); // ✅ QUEUE ENTRY

  try {
    const { input, mode, tone, retry } = await req.json();

    if (!input?.trim()) {
      return NextResponse.json({ output: "Enter text." });
    }

    const prompt = buildPrompt(input, mode, tone, retry);

    let result = await openrouter(prompt);

    /* ---------- FALLBACK ---------- */
    if (isBad(result)) {
      await delay(300);
      const g = await gemini(prompt);
      if (!isBad(g)) result = g;
    }

    if (isBad(result)) result = input;

    result = formatOutput(result, mode);

    return NextResponse.json({ output: result && typeof result === "string" ? result : "", });
  } catch {
    return NextResponse.json({
      output: "Server busy, try again later",
    });
  } finally {
    releaseSlot(); // ✅ QUEUE EXIT
  }
}
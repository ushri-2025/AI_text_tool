import { NextResponse } from "next/server";

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
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- GEMINI ---------- */
async function gemini(prompt: string): Promise<string | null> {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

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
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();

    return clean(
      data?.candidates?.[0]?.content?.parts?.[0]?.text
    );
  } catch {
    return null;
  }
}

/* ---------- PROMPT ---------- */
function buildPrompt(input: string, mode: string, tone?: string) {
  if (mode === "autofix") {
    return `Fix grammar:\n${input}`;
  }
  if (mode === "improve") {
    return `Rewrite in ${tone} tone:\n${input}`;
  }
  if (mode === "humanize") {
    return `Make this natural:\n${input}`;
  }
  return `Write content:\n${input}`;
}

/* ---------- MAIN ---------- */
export async function POST(req: Request): Promise<Response> {
  await acquireSlot();

  try {
    const { input, mode, tone } = await req.json();

    if (!input?.trim()) {
      return NextResponse.json({ output: "Enter text." });
    }

    const prompt = buildPrompt(input, mode, tone);

    let result = await gemini(prompt);

    /* ✅ FALLBACK (IMPORTANT FOR DEMO) */
    if (!result) {
      result = "✨ AI is warming up... Please try again shortly.";
    }

    return NextResponse.json({
      output: result,
    });

  } catch {
    return NextResponse.json({
      output: "✨ AI is warming up... Please try again shortly.",
    });
  } finally {
    releaseSlot();
  }
}
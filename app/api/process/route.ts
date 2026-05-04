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
    .replace(/\b(undefined|null)\b/gi, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
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
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return null;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are a professional AI writing assistant.

Rules:
- Always modify the text based on the instruction
- NEVER return the original text unchanged
- Fix grammar, improve clarity, or rewrite depending on prompt
- Ensure output is clearly improved
- No explanations, only final output
`,
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
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${key}`,
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
    base = `Correct all grammar mistakes strictly.
Fix tense, punctuation, and sentence structure.
Ensure the sentence is natural and correct.
Return only corrected text.

Text:
${input}`;
  } else if (mode === "improve") {
    base = `Rewrite the text in a ${tone} tone.
Improve clarity, wording, and readability.
Make it sound more polished and refined.

Text:
${input}`;
  } else if (mode === "humanize") {
    base = `Rewrite the text to sound natural and human.
Avoid robotic phrasing.
Make it conversational and smooth.

Text:
${input}`;
  } else if (mode === "write") {
    base = `Write high-quality content based on the input.

Requirements:
- Follow the user's instruction exactly
- Generate NEW content (do not repeat input)
- Use proper structure and clarity
- Default length: up to 180 words (unless specified)

Return only the final content.

Text:
${input}`;
  }

  /* ---------- SMART RETRY ---------- */
  if (retry) {
    base += `
Rewrite again with a different structure and better quality.`;
  }

  return base;
}

/* ---------- MAIN ---------- */
export async function POST(req: Request) {
  await acquireSlot();

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

    return NextResponse.json({
      output: result && typeof result === "string" ? result : "",
    });
  } catch {
    return NextResponse.json({
      output: "Server busy, try again later",
    });
  } finally {
    releaseSlot();
  }
}
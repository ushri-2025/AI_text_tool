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

/* ---------- GEMINI ---------- */
async function gemini(prompt: string) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a professional AI writing assistant.

STRICT RULES:
- You MUST rewrite or improve the text
- NEVER return the original text unchanged
- Fix grammar, clarity, tone, and structure
- Make the output natural and polished
- For writing tasks, generate new structured content

IMPORTANT:
- Do NOT explain anything
- Return ONLY the final result

${prompt}`,
                },
              ],
            },
          ],
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
    base = `Fix all grammar mistakes in the text.

Requirements:
- Correct tense, spelling, and punctuation
- Improve sentence structure if needed
- Keep original meaning exactly the same
- Make it natural and fluent

Return only corrected text.

Text:
${input}`;
  }

  else if (mode === "improve") {
    base = `Rewrite the text in a ${tone} tone.

Requirements:
- Improve clarity and wording
- Use better vocabulary and sentence structure
- Make it polished and refined
- Keep meaning consistent

Return only improved text.

Text:
${input}`;
  }

  else if (mode === "humanize") {
    base = `Rewrite the text to sound natural and human.

Requirements:
- Make it conversational and smooth
- Avoid robotic phrasing
- Improve flow and readability
- Keep it simple and relatable

Return only rewritten text.

Text:
${input}`;
  }

  else if (mode === "write") {
    base = `Generate high-quality content based on the instruction.

Requirements:
- Follow the user's instruction exactly
- Create NEW content (do NOT repeat input)
- Use proper structure (paragraphs, flow)
- Default length: within 180 words unless specified

Return only final content.

Instruction:
${input}`;
  }

  if (retry) {
    base += `

Rewrite again with better clarity, improved structure, and variation.
Ensure the output is clearly better than before.`;
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

    let result = await gemini(prompt);

    /* ---------- SAFETY CHECK ---------- */
    if (
      result &&
      result.trim().toLowerCase() === input.trim().toLowerCase()
    ) {
      await delay(200);
      result = await gemini(prompt);
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
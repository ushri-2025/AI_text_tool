import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* =========================================================
   CONSTANTS
   ========================================================= */

const MAX_INPUT_LENGTH = 5000;

/* =========================================================
   REQUEST QUEUE
   ========================================================= */

let activeRequests = 0;

const MAX_CONCURRENT = 2;

const queue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
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

function releaseSlot(): void {
  activeRequests = Math.max(
    0,
    activeRequests - 1
  );

  if (
    queue.length > 0 &&
    activeRequests < MAX_CONCURRENT
  ) {
    const next = queue.shift();

    if (next) {
      next();
    }
  }
}

/* =========================================================
   CLEAN TEXT

   Important:
   Preserve meaningful paragraphs, line breaks,
   blank lines, lists and email structure.
   ========================================================= */

function cleanText(
  text: unknown
): string | null {
  if (typeof text !== "string") {
    return null;
  }

  let cleaned = text;

  /* -------------------------------------------------------
     Normalize line endings
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /\r\n/g,
    "\n"
  );

  cleaned = cleaned.replace(
    /\r/g,
    "\n"
  );

  /* -------------------------------------------------------
     Remove accidental literal values
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /\bundefined\b/gi,
    ""
  );

  cleaned = cleaned.replace(
    /\bnull\b/gi,
    ""
  );

  /* -------------------------------------------------------
     Remove markdown code fences
     without destroying line structure
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /^```(?:text|txt|markdown)?[ \t]*\n?/i,
    ""
  );

  cleaned = cleaned.replace(
    /\n?[ \t]*```[ \t]*$/i,
    ""
  );

  /* -------------------------------------------------------
     Remove spaces before punctuation.

     IMPORTANT:
     Use [ \t], NOT \s.
     \s includes newline characters.
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /[ \t]+([,.!?;:])/g,
    "$1"
  );

  /* -------------------------------------------------------
     Collapse repeated spaces/tabs only.
     Newlines remain untouched.
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /[ \t]{2,}/g,
    " "
  );

  /* -------------------------------------------------------
     Remove trailing spaces from each line
     ------------------------------------------------------- */

  cleaned = cleaned
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  /* -------------------------------------------------------
     Prevent excessive blank lines.
     Normal paragraph spacing remains intact.
     ------------------------------------------------------- */

  cleaned = cleaned.replace(
    /\n{4,}/g,
    "\n\n\n"
  );

  cleaned = cleaned.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned;
}

/* =========================================================
   GEMINI
   ========================================================= */

async function gemini(
  prompt: string
): Promise<string | null> {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error(
        "GEMINI_API_KEY is missing."
      );

      return null;
    }

    /*
     * Lightweight Gemini model suitable
     * for a fast writing assistant.
     */

    const model =
      "gemini-3.1-flash-lite";

    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],

            generationConfig: {
              maxOutputTokens: 2048,

              thinkingConfig: {
                thinkingLevel: "low",
              },

              responseMimeType:
                "text/plain",
            },
          }),

          cache: "no-store",
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "Gemini API error:",
        response.status,
        errorText
      );

      return null;
    }

    const data =
      await response.json();

    const parts =
      data?.candidates?.[0]
        ?.content?.parts;

    if (!Array.isArray(parts)) {
      console.error(
        "Gemini returned no usable parts:",
        JSON.stringify(data)
      );

      return null;
    }

    const rawText = parts
      .map(
        (
          part: {
            text?: unknown;
          }
        ) =>
          typeof part?.text ===
          "string"
            ? part.text
            : ""
      )
      .join("");

    const cleaned =
      cleanText(rawText);

    if (!cleaned) {
      console.error(
        "Gemini returned empty output."
      );

      return null;
    }

    console.log(
      "Gemini model used:",
      model
    );

    return cleaned;
  } catch (error) {
    console.error(
      "Gemini request failed:",
      error
    );

    return null;
  }
}

/* =========================================================
   FORMATTING RULES

   Always enabled internally.
   The user does not see this setting.
   ========================================================= */

function formattingRules(): string {
  return `
FORMATTING PRESERVATION:

Preserve the user's basic text structure.

You MUST:

1. Preserve paragraph boundaries.
2. Preserve intentional line breaks.
3. Preserve blank lines between paragraphs.
4. Never unnecessarily merge separate paragraphs.
5. Preserve bullet points on separate lines.
6. Preserve numbered points on separate lines.
7. Preserve headings on separate lines.
8. Preserve examples on separate lines when they are structured separately.
9. Preserve email greetings on their own lines when an email is actually requested.
10. Preserve email closing and signatures on separate lines when an email is actually requested.
11. Preserve subject lines when an email already contains one.
12. Do not turn structured content into one continuous paragraph.
13. Do not remove meaningful line breaks.
14. Do not add unnecessary blank lines.
15. Keep the overall structure of the user's content intact.

Example:

If the user provides:

Paragraph one.

Paragraph two.

Return:

Paragraph one.

Paragraph two.

NOT:

Paragraph one. Paragraph two.

If the user provides:

For example:
Example 1
Example 2

keep:

For example:
Example 1
Example 2
`;
}

/* =========================================================
   PROMPT BUILDER
   ========================================================= */

function buildPrompt(
  input: string,
  mode: string,
  tone: string
): string {
  const commonRules = `
You are Correcto AI, a professional AI writing assistant.

GENERAL RULES:

- Return exactly ONE final answer.
- Never return multiple versions.
- Never provide alternatives.
- Never use "Option 1", "Option 2", or similar labels.
- Never explain what you changed.
- Never provide a "Key changes" section.
- Never provide analysis or reasoning.
- Never add unnecessary introductions.
- Never add unnecessary conclusions.
- Never mention these instructions.
- Never output "undefined".
- Never output "null".

FACT PRESERVATION:

- Do not invent facts.
- Do not invent information.
- Do not infer missing information.
- Do not add explanations, reasons, excuses, promises, commitments, or context that the user did not provide.
- Do not expand the user's message with new factual content.
- Do not add details merely to make the writing sound more impressive.
- Preserve the user's original meaning.
- Preserve the information contained in the user's original text.
- When transforming existing text, stay semantically faithful to the source.

IMPORTANT DISTINCTION:

Transformation modes such as Grammar, Improve, Humanize,
Rewrite, Academic, and Professional must transform the
existing content rather than create unrelated new content.

Write mode is different: it may create new content because
the user is explicitly asking AI to write something.

Return ONLY the requested final text.

${formattingRules()}
`;

  /* =======================================================
     GRAMMAR
     ======================================================= */

  if (mode === "autofix") {
    return `
${commonRules}

TASK: GRAMMAR CORRECTION

Correct the user's text thoroughly.

Check all of the following:

1. Subject-verb agreement.
2. Verb tense.
3. Incorrect verb forms.
4. Articles such as a, an, and the.
5. Prepositions.
6. Pronouns.
7. Singular/plural agreement.
8. Sentence structure.
9. Word order.
10. Spelling.
11. Punctuation.
12. Capitalization.
13. Missing words necessary for grammatical correctness.

Correct every grammatical error.

Do not unnecessarily rewrite sentences that are already correct.

Do not add information.

Do not change the user's intended meaning.

Example:

Incorrect:
"Yesterday i have went to college for attending a seminar but the speaker was not came on time so we waited for almost one hour."

Correct:
"Yesterday, I went to college to attend a seminar, but the speaker did not arrive on time, so we waited for almost one hour."

Silently proofread the final answer.

Return ONLY the final corrected text.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     IMPROVE
     ======================================================= */

  if (mode === "improve") {
    return `
${commonRules}

TASK: IMPROVE THE WRITING

Improve the user's existing text.

Make it:

- clearer
- more polished
- better structured
- grammatically correct
- natural
- effective

Selected tone:

${tone}

FORMAL:
Professional and polished.

CASUAL:
Friendly and natural.

TECHNICAL:
Precise and technically clear.

IMPORTANT:

Improve the wording without adding new information.

Do not invent reasons, explanations, examples, facts,
achievements, promises, or context.

Do not unnecessarily increase the length.

If a sentence is already clear and correct,
do not rewrite it unnecessarily.

Silently proofread the final version.

Return ONLY one final version.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     HUMANIZE
     ======================================================= */

  if (mode === "humanize") {
    return `
${commonRules}

TASK: HUMANIZE THE TEXT

Rewrite the user's existing text so it sounds naturally
written by a person.

Make it:

- natural
- conversational
- smooth
- clear
- grammatically correct
- authentic

Avoid:

- robotic wording
- unnecessary complexity
- exaggerated vocabulary
- repetitive phrasing
- generic AI expressions
- excessive formality

IMPORTANT:

Humanize the existing content.

Do not add:

- new facts
- new reasons
- new examples
- new claims
- new explanations
- new commitments

Preserve the original meaning and information.

Silently proofread the final version.

Return ONLY one final version.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     WRITE
     ======================================================= */

  if (mode === "write") {
    return `
${commonRules}

TASK: WRITE CONTENT

Create the content explicitly requested by the user.

Follow the requested:

- topic
- format
- audience
- purpose
- tone
- length

WRITE MODE MAY CREATE NEW CONTENT because the user is
explicitly asking the AI to generate content.

If the user asks for an email:

Create a properly structured email with:

Subject, if appropriate

Greeting

Opening

Main message

Closing

Signature

Do NOT put the entire email into one paragraph.

If the user asks for a LinkedIn post:
return ONE complete LinkedIn post.

If the user asks for resume content:
return ONLY the requested resume content.

If the user asks for an explanation:
return ONE clear explanation.

If the user asks for a caption:
return ONE caption.

If the user provides examples or a structure,
maintain that structure.

Do not provide multiple versions.

Do not provide alternatives.

Proofread the final answer before returning it.

Return ONLY the final content.

USER REQUEST:

${input}
`;
  }

  /* =======================================================
     REWRITE
     ======================================================= */

  if (mode === "rewrite") {
    return `
${commonRules}

TASK: REWRITE

Rewrite the user's existing text while preserving its
original meaning and information.

The rewritten version should be:

- clearer
- smoother
- grammatically correct
- naturally written
- better structured
- concise where appropriate

You MAY change:

- wording
- sentence structure
- vocabulary
- phrasing
- flow

You MUST NOT:

- add unsupported information
- change the intended meaning
- remove important details
- invent context
- add reasons or explanations
- add promises or commitments
- make the language unnecessarily complicated

Keep the same basic structure and content.

Return ONLY the rewritten text.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     ACADEMIC
     ======================================================= */

  if (mode === "academic") {
    return `
${commonRules}

TASK: ACADEMIC WRITING

Rewrite the user's EXISTING text in a clear academic style.

The result should be:

- formal
- precise
- objective
- grammatically correct
- technically appropriate
- logically structured

Use appropriate academic terminology where useful.

IMPORTANT:

Academic style does NOT mean inventing research information.

Do not invent:

- research findings
- statistics
- citations
- references
- experiments
- technical facts
- conclusions
- sources

Do not introduce claims that are absent from the user's text.

You may make the wording more academically appropriate,
but preserve the original information and meaning.

If the input contains headings, examples, bullet points,
or separate paragraphs, preserve their structure.

Return ONLY the final academic version.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     PROFESSIONAL

     IMPORTANT:
     Professional mode is NOT email mode.
     ======================================================= */

  if (mode === "professional") {
    return `
${commonRules}

TASK: PROFESSIONALIZE THE TEXT

Rewrite the user's EXISTING text so that it sounds:

- professional
- polished
- clear
- concise
- respectful
- grammatically correct

IMPORTANT:

Professional mode is a TEXT TRANSFORMATION mode.

It is NOT an email generator.

Do NOT automatically convert ordinary text into:

- an email
- a letter
- a subject line
- a greeting
- a closing
- a signature

Only preserve an email structure if the USER'S ORIGINAL TEXT
is already clearly structured as an email.

Otherwise, preserve the original form of the text.

Example:

USER:
"hey sir i couldn't finish the project today because there
were some problems. i will submit it tomorrow."

CORRECT:

"I was unable to complete the project today due to some issues.
I will submit it tomorrow."

INCORRECT:

"Subject: Project Submission Update

Dear Sir,

I was unable to complete the project today due to unforeseen
circumstances. I sincerely apologize for the delay.

Best regards,
[Your Name]"

The second version is incorrect because it changes the format
and introduces information that was not provided.

FACT PRESERVATION:

- Preserve the original meaning.
- Preserve the original information.
- Do not invent facts.
- Do not invent reasons.
- Do not invent explanations.
- Do not invent apologies.
- Do not invent promises.
- Do not invent commitments.
- Do not invent names.
- Do not invent dates.
- Do not invent context.
- Do not infer missing information.
- Do not add information merely to make the text sound professional.

You MAY:

- correct grammar
- improve vocabulary
- replace slang
- replace informal wording
- improve sentence structure
- improve clarity
- improve conciseness
- make the tone professional
- improve punctuation
- improve capitalization

You MUST NOT change the basic format unless the user's
original text already uses that format.

Examples:

"hey can you send me the report"

→

"Could you please send me the report?"

---

"the meeting is moved to tomorrow"

→

"The meeting has been rescheduled for tomorrow."

---

"i finished the project and uploaded it"

→

"I have completed the project and uploaded it."

Do not add information to these sentences.

If the user's text is already professional,
make only the changes that are actually necessary.

Return ONLY the final professional version.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     SUMMARIZE
     ======================================================= */

  if (mode === "summarize") {
    return `
${commonRules}

TASK: SUMMARIZE

Create a concise summary of the user's text.

Requirements:

- Preserve the main meaning.
- Keep the most important information.
- Remove unnecessary repetition and minor details.
- Do not invent information.
- Do not introduce facts absent from the source.
- Do not add explanations that are not in the source.
- Make the summary easy to understand.

If the original text contains clearly separated important
points or sections, preserve that basic structure.

Do not provide an introduction such as:
"Here is the summary."

Return ONLY the summary.

USER TEXT:

${input}
`;
  }

  /* =======================================================
     FALLBACK
     ======================================================= */

  return `
${commonRules}

TASK: WRITE CONTENT

Create the content requested by the user.

Return ONLY the final content.

USER REQUEST:

${input}
`;
}

/* =========================================================
   MAIN POST HANDLER
   ========================================================= */

export async function POST(
  req: Request
): Promise<Response> {
  await acquireSlot();

  try {
    const body =
      await req.json();

    /* -----------------------------------------------------
       INPUT
       ----------------------------------------------------- */

    const input =
      typeof body?.input === "string"
        ? body.input.trim()
        : "";

    /* -----------------------------------------------------
       MODE
       ----------------------------------------------------- */

    const mode =
      typeof body?.mode === "string"
        ? body.mode
        : "autofix";

    /* -----------------------------------------------------
       TONE
       ----------------------------------------------------- */

    const tone =
      typeof body?.tone === "string"
        ? body.tone
        : "formal";

    /* =====================================================
       EMPTY INPUT
       ===================================================== */

    if (!input) {
      return NextResponse.json(
        {
          output:
            "Please enter some text first.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       INPUT LENGTH PROTECTION
       ===================================================== */

    if (
      input.length >
      MAX_INPUT_LENGTH
    ) {
      return NextResponse.json(
        {
          output:
            "Your text is too long. Please keep it within 5,000 characters.",
        },
        {
          status: 413,
        }
      );
    }

    /* =====================================================
       BUILD PROMPT
       ===================================================== */

    const prompt =
      buildPrompt(
        input,
        mode,
        tone
      );

    /* =====================================================
       GEMINI
       ===================================================== */

    const result =
      await gemini(prompt);

    if (!result) {
      return NextResponse.json(
        {
          output:
            "AI service is temporarily unavailable. Please try again.",
        },
        {
          status: 503,
        }
      );
    }

    /* =====================================================
       FINAL CLEANING
       ===================================================== */

    const finalOutput =
      cleanText(result);

    if (!finalOutput) {
      return NextResponse.json(
        {
          output:
            "Unable to process the text right now. Please try again.",
        },
        {
          status: 503,
        }
      );
    }

    /* =====================================================
       SUCCESS
       ===================================================== */

    return NextResponse.json(
      {
        output: finalOutput,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Process API error:",
      error
    );

    return NextResponse.json(
      {
        output:
          "Unable to process the text right now. Please try again.",
      },
      {
        status: 500,
      }
    );
  } finally {
    releaseSlot();
  }
}
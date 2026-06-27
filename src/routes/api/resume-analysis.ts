import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const RESUME_SYSTEM = `You are Aurora Resume Analyst — an expert AI career coach and resume optimizer.

Your capabilities:
1. **Resume Analysis**: Analyze resumes for completeness, impact, and ATS-friendliness.
2. **Job Description Matching**: Compare resumes against job descriptions to identify matches and gaps.
3. **Resume Enhancement**: Suggest specific improvements to bullet points, skills, and formatting.
4. **Job Description Parsing**: Extract key requirements, skills, and qualifications from job postings.
5. **Gap Analysis**: Identify what skills/experience the candidate is missing for a target role.

When analyzing:
- Use structured markdown with clear headings
- Provide a match score (0-100%) when comparing resume to job description
- Highlight specific improvements with before/after examples
- List missing skills or qualifications
- Suggest action items prioritized by impact

Always be constructive, specific, and actionable in your feedback.`;

export const Route = createFileRoute("/api/resume-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const supabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabasePublishable } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        // Rate limit: 5 analyses per minute per user
        const rl = checkRateLimit(`resume:${userId}`, { maxRequests: 5, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
        const rateLimitHeaders = { "X-RateLimit-Remaining": String(rl.remaining) };

        const body = (await request.json()) as {
          resumeText: string;
          jobDescription?: string;
          analysisType: "analyze" | "match" | "enhance";
          threadId?: string;
        };

        const { resumeText, jobDescription, analysisType, threadId } = body;

        if (!resumeText?.trim()) {
          return new Response("Resume text is required", { status: 400 });
        }

        if (!process.env.LOVABLE_API_KEY) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        // Create thread if not provided
        let activeThreadId = threadId;
        if (!activeThreadId) {
          const title = `Resume ${analysisType} — ${resumeText.slice(0, 40).replace(/\s+/g, " ").trim()}`;
          const { data: thread } = await supabase
            .from("threads")
            .insert({ user_id: userId, title: `[resume] ${title}`, model: "tool-resume" })
            .select("id")
            .single();
          activeThreadId = thread?.id;
        }

        // Save user message
        if (activeThreadId) {
          const userContent = `[${analysisType}] ${resumeText.slice(0, 500)}${jobDescription ? `\n\nJob: ${jobDescription.slice(0, 300)}` : ""}`;
          await supabase.from("messages").insert({
            thread_id: activeThreadId,
            user_id: userId,
            role: "user",
            content: userContent,
          });
        }

        let userPrompt = "";

        switch (analysisType) {
          case "analyze":
            userPrompt = `Please analyze the following resume in detail. Provide:
1. Overall assessment and score (1-10)
2. Strengths
3. Areas for improvement
4. ATS-friendliness check
5. Specific suggestions with before/after examples

**Resume:**
${resumeText}`;
            break;

          case "match":
            if (!jobDescription?.trim()) {
              return new Response("Job description is required for match analysis", { status: 400 });
            }
            userPrompt = `Compare this resume against the job description. Provide:
1. Overall match score (0-100%)
2. Matching skills and qualifications (with evidence)
3. Missing requirements (prioritized by importance)
4. Gap analysis with recommendations
5. Tailored suggestions to improve the match

**Resume:**
${resumeText}

**Job Description:**
${jobDescription}`;
            break;

          case "enhance":
            userPrompt = `Enhance this resume with the following improvements:
1. Rewrite weak bullet points to be more impactful (using STAR method)
2. Add missing keywords for ATS optimization
3. Improve formatting and structure
4. Quantify achievements where possible
5. Provide the enhanced version ready to use

**Resume:**
${resumeText}${jobDescription ? `\n\n**Target Job Description:**\n${jobDescription}` : ""}`;
            break;
        }

        const gateway = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
        const model = gateway("google/gemini-2.5-pro");

        const result = streamText({
          model,
          system: RESUME_SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
          onFinish: async ({ text }) => {
            if (text?.trim() && activeThreadId) {
              await supabase.from("messages").insert({
                thread_id: activeThreadId,
                user_id: userId,
                role: "assistant",
                content: text,
              });
            }
          },
        });

        return result.toUIMessageStreamResponse({
          headers: { ...rateLimitHeaders, "X-Thread-Id": activeThreadId ?? "" },
        });
      },
    },
  },
});

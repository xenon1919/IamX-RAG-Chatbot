import { NextRequest, NextResponse } from "next/server";
import { genAI, CHAT_MODEL } from "@/lib/gemini";
import fs from "fs";
import path from "path";

// Simple scoring function for keyword relevance
function findRelevantChunks(query: string, knowledgeBase: any[], topK = 8) {
  const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'is', 'in', 'it', 'for', 'on', 'with', 'as', 'this', 'that', 'with']);
  const queryTokens = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  if (queryTokens.length === 0) return knowledgeBase.slice(0, topK);

  const scoredChunks = knowledgeBase.map(chunk => {
    let score = 0;
    const chunkKeywords = new Set(chunk.keywords);
    
    queryTokens.forEach(token => {
      // Direct match
      if (chunkKeywords.has(token)) score += 2;
      // Partial match
      else if (chunk.content.toLowerCase().includes(token)) score += 0.5;
    });

    return { ...chunk, score };
  });

  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(chunk => chunk.score > 0 || scoredChunks.indexOf(chunk) < topK / 2); // Ensure we get some context even with low scores
}

export async function POST(req: NextRequest) {
    try {
        const { messages } = await req.json();
        const lastMessage = messages[messages.length - 1].content;

        console.log(`[AI] Optimizing for model: ${CHAT_MODEL}`);

        // 1. Load the chunked knowledge base
        const knowledgePath = path.join(process.cwd(), "src/data/knowledge-base.json");
        if (!fs.existsSync(knowledgePath)) {
            console.error("[AI] Knowledge base not found at", knowledgePath);
            return NextResponse.json({ error: "Knowledge base not found. Please run the processing script." }, { status: 500 });
        }
        
        const knowledgeBase = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"));

        // 2. Perform high-speed keyword retrieval (Zero-Latency Retrieval)
        console.time("Retrieval");
        const relevantChunks = findRelevantChunks(lastMessage, knowledgeBase);
        console.timeEnd("Retrieval");

        const context = relevantChunks.map(c => `[Source: ${c.metadata.source}, ${c.metadata.chapter}]\n${c.content}`).join("\n\n---\n\n");
        console.log(`[AI] Retrieved ${relevantChunks.length} relevant chunks`);

        // 3. Initialize Gemini
        const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
        
        const systemPrompt = `You are iAmX Support Agent, a document-grounded assistant that helps users navigate the iAmX app.

You must answer user questions using only the provided document excerpts.
Inputs
Question:
${lastMessage}
Document Excerpts:
${context}


Instructions
Provide a high-level, step-by-step answer.
Keep it clear, short, and accurate.
Do not guess or add anything not found in the excerpts.
Always include a References section.

In References, mention:
exact document name
exact chapter / section / module name
exact page number if present in the excerpts

If multiple excerpts support the answer, include all relevant references.

If the answer is not available, clearly say you could not find it in the provided documents.
Never invent references.
Output Format
Answer:
...
...
...
References:
Document Name, Chapter/Section, Page X
Document Name, Chapter/Section, Page Y


Example answer for your reference:
Answer:
Navigate to the POS login page.
Enter your email.
Enter your 4-digit PIN.
Log in to continue.
References:
IAMX POS DOC, Chapter 2: POS Login Flow, Page 8.`;

        // 4. Call Gemini with optimized prompt
        const contents = [
          { role: 'user', parts: [{ text: systemPrompt }] },
          ...messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        ];

        console.log("[AI] Calling Gemini API...");
        const result = await model.generateContentStream({ contents });

        // 5. Stream response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result.stream) {
                        const text = chunk.text();
                        controller.enqueue(encoder.encode(text));
                    }
                } catch (err) {
                    console.error("[AI] Stream error:", err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });

    } catch (error: any) {
        console.error("[AI] Chat API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

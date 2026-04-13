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

        console.log(`[RAG] Optimizing for model: ${CHAT_MODEL}`);

        // 1. Load the chunked knowledge base
        const knowledgePath = path.join(process.cwd(), "src/data/knowledge-base.json");
        if (!fs.existsSync(knowledgePath)) {
            console.error("[RAG] Knowledge base not found at", knowledgePath);
            return NextResponse.json({ error: "Knowledge base not found. Please run the processing script." }, { status: 500 });
        }
        
        const knowledgeBase = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"));

        // 2. Perform high-speed keyword retrieval (Zero-Latency Retrieval)
        console.time("Retrieval");
        const relevantChunks = findRelevantChunks(lastMessage, knowledgeBase);
        console.timeEnd("Retrieval");

        const context = relevantChunks.map(c => `[Source: ${c.metadata.source}, ${c.metadata.chapter}]\n${c.content}`).join("\n\n---\n\n");
        console.log(`[RAG] Retrieved ${relevantChunks.length} relevant chunks`);

        // 3. Initialize Gemini
        const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
        
        const systemPrompt = `You are a helpful iAmX assistant. I have provided RELEVANT snippets from the uploaded documents (Store.pdf and iAmX.pdf) below.
Use this information to answer the user's questions step-by-step with high accuracy.

Relevant Context:
${context}

Instructions:
- Answer step-by-step based ONLY on the provided context.
- CITATION REQUIREMENT: In every response, you MUST mention the source filename and the Chapter name/number (e.g., [Source: Store.pdf, Chapter 1]) that the information was found in.
- If the answer spans multiple chapters, list all of them.
- If the information is not in the snippets, clearly state that you don't know based on the provided documents.
- Use Markdown for structured formatting.
- Be professional and detailed.`;

        // 4. Call Gemini with optimized prompt
        const contents = [
          { role: 'user', parts: [{ text: systemPrompt }] },
          ...messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        ];

        console.log("[RAG] Calling Gemini API...");
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
                    console.error("[RAG] Stream error:", err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });

    } catch (error: any) {
        console.error("[RAG] Chat API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

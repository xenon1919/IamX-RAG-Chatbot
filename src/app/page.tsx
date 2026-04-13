"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { RiSendPlane2Fill, RiRobot2Line, RiUserLine } from "@remixicon/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am your **iAmX AI Assistant**. I can help you with information from your documents (Store.pdf and iAmX.pdf). How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch response");

      const reader = response.body?.getReader();
      const decoder = new TextEncoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        assistantContent += text;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: assistantContent },
          ];
        });
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <header style={{ marginBottom: "2rem", textAlign: "center", animation: "fadeIn 0.8s ease" }}>
        <img 
          src="/iamx-logo.png" 
          alt="iAmX Logo" 
          style={{ width: "80px", height: "auto", marginBottom: "1rem" }}
        />
        <h1 style={{ fontSize: "2.5rem", fontWeight: 700, letterSpacing: "-1px", background: "linear-gradient(to right, #fff, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          iAmX Chatbot
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "0.5rem" }}>
          RAG-powered Intelligence based on your data
        </p>
      </header>

      <div className="chat-container" ref={scrollRef}>
        <AnimatePresence>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`message ${m.role}`}
            >
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ 
                  marginTop: "0.25rem",
                  width: "2rem", 
                  height: "2rem", 
                  borderRadius: "50%", 
                  background: m.role === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--accent)',
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  {m.role === 'user' ? <RiUserLine size={16} /> : <RiRobot2Line size={16} />}
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem", opacity: 0.6 }}>
                    {m.role === "user" ? "You" : "iAmX Assistant"}
                  </div>
                  <div className="content">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && messages[messages.length-1].role === 'user' && (
             <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             className="message assistant"
             style={{ opacity: 0.5 }}
           >
             <div style={{ display: "flex", gap: "10px" }}>
               <div className="dot" style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%", animation: "glow 1.5s infinite" }}></div>
               <div className="dot" style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%", animation: "glow 1.5s infinite", animationDelay: "0.2s" }}></div>
               <div className="dot" style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%", animation: "glow 1.5s infinite", animationDelay: "0.4s" }}></div>
             </div>
           </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form className="input-area glass" onSubmit={handleSubmit}>
        <input
          placeholder="Ask me anything step-by-step..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          <RiSendPlane2Fill size={20} />
        </button>
      </form>
    </main>
  );
}

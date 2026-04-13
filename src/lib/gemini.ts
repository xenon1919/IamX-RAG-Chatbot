import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";
export const genAI = new GoogleGenerativeAI(apiKey);

export const CHAT_MODEL = "gemini-3.1-pro-preview";
export const EMBEDDING_MODEL = "embedding-001";

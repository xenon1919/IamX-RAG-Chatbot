const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function chunkTextWithMetadata(text, sourceName) {
    const chunks = [];
    // Regex for: Chapter X: Name, Topic X: Name, Section X: Name
    const chapterRegex = /(?:Chapter|Topic|Section)\s+(\d+)[:.]?\s+(.*?)(?:\n|$)/gi;
    
    let lastChapter = "Introduction / Overview";
    let lastIndex = 0;
    
    // Find all chapter headings and their positions
    let match;
    const headings = [];
    while ((match = chapterRegex.exec(text)) !== null) {
        headings.push({
            index: match.index,
            title: `Chapter ${match[1]}: ${match[2].trim()}`,
            fullMatch: match[0]
        });
    }

    // Process text in segments between chapters
    if (headings.length === 0) {
        // No chapters found, chunk the whole thing as one unit
        return createStoreChunks(text, lastChapter, sourceName);
    }

    // Chunk the intro (before first chapter)
    const introText = text.substring(0, headings[0].index);
    if (introText.trim().length > 50) {
        chunks.push(...createStoreChunks(introText, lastChapter, sourceName));
    }

    for (let i = 0; i < headings.length; i++) {
        const currentChapter = headings[i].title;
        const start = headings[i].index;
        const end = (i + 1 < headings.length) ? headings[i + 1].index : text.length;
        const chapterText = text.substring(start, end);
        
        chunks.push(...createStoreChunks(chapterText, currentChapter, sourceName));
    }

    return chunks;
}

function createStoreChunks(text, chapterName, sourceName) {
    const totalChunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + CHUNK_SIZE;
        const content = text.substring(start, end).trim();
        if (content.length > 50) {
            totalChunks.push({
                content,
                keywords: getKeywords(content),
                metadata: {
                    source: sourceName,
                    chapter: chapterName
                }
            });
        }
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return totalChunks;
}

function getKeywords(text) {
    const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'is', 'in', 'it', 'for', 'on', 'with', 'as', 'this', 'that', 'with']);
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
}

async function processPdf(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text;
    const fileName = path.basename(filePath);
    
    console.log(`Processing ${fileName}... (${text.length} chars)`);
    return chunkTextWithMetadata(text, fileName);
}

async function main() {
    const pdfs = ['data/Store.pdf', 'data/iAmX.pdf'];
    let allChunks = [];

    for (const pdfFile of pdfs) {
        if (fs.existsSync(pdfFile)) {
            const chunks = await processPdf(pdfFile);
            allChunks = allChunks.concat(chunks);
        } else {
            console.warn(`File not found: ${pdfFile}`);
        }
    }

    const outputPath = 'src/data/knowledge-base.json';
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(allChunks, null, 2));
    console.log(`Successfully indexed ${allChunks.length} chunks with chapter metadata to ${outputPath}`);
}

main().catch(console.error);

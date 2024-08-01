import OpenAI from 'openai';
import {crawlPage} from './lib/crawl-page';
import {embedAndIndexContent} from './lib/embed-content';
import {parseHTML} from './lib/parse-html';
import {OpenAIEmbeddings} from '@langchain/openai';
import {Index} from '@upstash/vector';

const oai = new OpenAI({
  apiKey: process.env.OPENAI_API_TOKEN,
});

const index = new Index({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_INDEX_TOKEN,
});

const model = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_TOKEN,
  model: 'text-embedding-3-small',
  dimensions: 1536,
});

type ResultQuery = {
  id: string;
  score: number;
  metadata: {text: string};
};

const server = Bun.serve({
  port: 3000,
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname === '/search' && req.method === 'POST') {
      const {query} = await req.json();
      if (!query) {
        return new Response('Missing query parameter', {status: 400});
      }

      try {
        // 1. Get embedding for the query
        const embedding = await model.embedQuery(query);

        // 2. Query the vector database
        const queryResult = (await index.query({
          vector: embedding,
          topK: 5,
          includeMetadata: true,
        })) as ResultQuery[];

        console.log('Query result:', queryResult);

        // 3. Prepare context
        let context: string = queryResult
          .map((chunk) => chunk.metadata.text)
          .join('\n\n');

        // If the context is too large, truncate it
        const MAX_CONTEXT_LENGTH = 4000;
        if (context.length > MAX_CONTEXT_LENGTH) {
          context = context.slice(0, MAX_CONTEXT_LENGTH) + '\n\n...';
        }

        // 4. Prepare prompt for OpenAI
        const aiPrompt = `
        You are an AI research assistant analyzing text chunks from web sources to answer queries accurately and concisely.
        Use ONLY the information contained in the following text chunks to formulate your response:

        ${context}

        Query: ${query}

        Remember:
        - If the chunks contain no relevant information to the query, respond with "I don't know".
        - Do not use any external knowledge or make assumptions beyond what is explicitly stated in the chunks.
        - Do not mention or reference the sources of the information.
        - Provide a concise, relevant answer that directly addresses the query.
        - Maintain a professional and objective tone.
        - If the information in the chunks is insufficient or contradictory, state this clearly.

        Answer:`;

        // 5. Call OpenAI API
        const oaiResponse = await oai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that answers queries based solely on provided information.',
            },
            {role: 'user', content: aiPrompt},
          ],
          max_tokens: 300,
          temperature: 0.1,
          model: 'gpt-3.5-turbo',
        });

        const answer = oaiResponse.choices[0].message.content;

        // 6. Return the response
        return new Response(JSON.stringify(answer), {
          headers: {'Content-Type': 'application/json'},
        });
      } catch (error) {
        console.error('Query error:', error);
        return new Response('Internal server error', {status: 500});
      }
    }

    if (url.pathname === '/crawl' && req.method === 'POST') {
      const {url} = await req.json();

      if (!url) {
        return new Response('Missing url parameter', {status: 400});
      }

      try {
        const html = await crawlPage(url);
        const content = parseHTML(html);
        const indexedContent = await embedAndIndexContent(content, url);

        return new Response(JSON.stringify(indexedContent), {
          headers: {'Content-Type': 'application/json'},
        });
      } catch (error) {
        console.error('Crawl error:', error);
        return new Response('Internal server error', {status: 500});
      }
    }

    return new Response('Not Found', {status: 404});
  },
});

console.log(`Server running at ${server.url}`);

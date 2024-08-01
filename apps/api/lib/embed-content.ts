import {OpenAIEmbeddings} from '@langchain/openai';
import {Index} from '@upstash/vector';
import pQueue from 'p-queue';

const index = new Index({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_INDEX_TOKEN,
});

const model = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_TOKEN,
  model: 'text-embedding-3-small',
  dimensions: 1536,
});

const queue = new pQueue({concurrency: 5});

export async function embedAndIndexContent(content: string, url: string) {
  const chunkSize = 4000;
  const chunks = [];

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.substring(i, i + chunkSize));
  }

  const chunkPromises = chunks.map((chunk) => {
    return queue.add(async () => {
      const embedding = await model.embedQuery(chunk);
      return {text: chunk, vector: embedding};
    });
  });

  const embeddedChunks = await Promise.all(chunkPromises);

  const vectors = embeddedChunks.map((chunk) => chunk.vector);

  const avgVector = vectors[0].map(
    (_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length
  );

  const doc = {
    id: url,
    metadata: {
      text: embeddedChunks.map((chunk) => chunk.text).join('\n\n'),
    },
    vector: avgVector,
  };

  await index.upsert([doc]);

  return embeddedChunks.map((chunk) => chunk.text);
}

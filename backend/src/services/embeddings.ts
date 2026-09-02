import { InferenceClient } from "@huggingface/inference";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";

const client = new InferenceClient(env.HUGGINGFACE_API_KEY);

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedOne(text: string): Promise<number[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await client.featureExtraction({
        model: EMBEDDING_MODEL,
        inputs: text,
        provider: "hf-inference",
      });

      const vector = Array.isArray(result[0])
        ? (result as number[][])[0]
        : (result as number[]);

      return vector;
    } catch (err) {
      lastError = err;
      const delay = BASE_DELAY_MS * 2 ** attempt;
      logger.warn(
        { attempt, delay, err },
        "HF embedding call failed, retrying (cold start / rate limit likely)"
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `Failed to embed text after ${MAX_RETRIES} attempts: ${lastError}`
  );
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embedOne(text));
  }
  return vectors;
}

export { EMBEDDING_MODEL };

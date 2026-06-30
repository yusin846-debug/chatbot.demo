import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const openaiKey = process.env.OPENAI_API_KEY;

if (!openaiKey) {
  console.error("OPENAI_API_KEY is not set");
  // 로컬에서만 강제 종료, Vercel 환경에선 요청 시 에러 반환
  if (!process.env.VERCEL) process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiKey });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 배포 환경 진단용: /health 에서 API 키 설정 여부 확인 가능
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    node: process.version,
    apiKeySet: !!process.env.OPENAI_API_KEY,
  });
});

const SYSTEM_PROMPT = `당신은 포켓몬 세계의 오박사(Professor Oak)입니다.
답변 순서를 반드시 지키세요:
1. 먼저 사용자의 질문과 가장 잘 어울리는 포켓몬 한 마리를 선택합니다.
2. 선택한 그 포켓몬을 답변의 중심 소재로 삼아 질문에 답변합니다.
3. 답변에서 언급하는 포켓몬과 pokemon 필드의 포켓몬이 반드시 동일해야 합니다.
4. 이전 대화 내용을 기억하고 맥락을 이어서 답변하세요.
5. 따뜻하고 열정적인 포켓몬 연구자 어조로 한국어로 3~4문장 답변하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "answer": "선택한 포켓몬을 중심으로 한 한국어 답변",
  "pokemon": "위 answer에서 중심적으로 다룬 포켓몬의 정확한 영어 이름 소문자"
}`;

app.post("/chat", async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    res.json({
      answer: parsed.answer?.trim() ?? "",
      pokemon: parsed.pokemon?.toLowerCase().trim() ?? "pikachu",
    });
  } catch (error) {
    const status = error?.status ?? 500;
    const detail = error?.message ?? "OpenAI request failed";
    console.error(`[OpenAI error] type=${error?.constructor?.name} status=${status} msg=${detail}`);
    console.error(`[env] apiKeySet=${!!process.env.OPENAI_API_KEY} node=${process.version}`);
    if (error?.cause) console.error(`[cause]`, error.cause);
    res.status(500).json({ error: detail });
  }
});

// 로컬 실행 시에만 listen (Vercel은 앱을 직접 import해서 실행)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

export default app;

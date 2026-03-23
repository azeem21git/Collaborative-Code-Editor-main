import { Router } from 'express';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

function extractJsonPayload(rawText) {
  if (!rawText) {
    return null;
  }

  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function runGeminiFix(code, language) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is missing on the Node server');
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.geminiModel });

  const prompt = [
    'You are a strict code fixer.',
    'Return ONLY valid JSON with exactly two keys: originalCode and correctedCode.',
    'Do not include markdown, comments, or extra fields.',
    `Language: ${language || 'plain text'}`,
    'Input code:',
    code,
  ].join('\n\n');

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsed = extractJsonPayload(responseText);

  if (!parsed || typeof parsed.correctedCode !== 'string') {
    throw new Error('Gemini response was not valid JSON in the expected format');
  }

  return {
    originalCode: String(parsed.originalCode || code),
    correctedCode: parsed.correctedCode,
  };
}

export function createAIRouter() {
  const router = Router();

  router.post('/vision/process', async (req, res) => {
    try {
      const response = await axios.post(`${config.aiEngineUrl}/vision/process`, req.body, {
        timeout: 30000,
      });

      res.json(response.data);
    } catch (error) {
      res.status(502).json({
        error: 'Unable to communicate with AI engine',
        details: error?.response?.data || error.message,
      });
    }
  });

  router.post('/vision/coordinates', async (req, res) => {
    try {
      const response = await axios.post(`${config.aiEngineUrl}/vision/coordinates`, req.body, {
        timeout: 30000,
      });

      res.json(response.data);
    } catch (error) {
      res.status(502).json({
        error: 'Unable to communicate with AI engine',
        details: error?.response?.data || error.message,
      });
    }
  });

  router.post('/fix-code', async (req, res) => {
    try {
      const { code, language } = req.body || {};

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code is required' });
      }

      const result = await runGeminiFix(code, language);

      return res.json({
        ...result,
        model: config.geminiModel,
      });
    } catch (error) {
      return res.status(502).json({
        error: 'Unable to generate AI fix',
        details: error.message,
      });
    }
  });

  return router;
}

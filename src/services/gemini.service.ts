import {
    GoogleGenerativeAI,
    type GenerationConfig,
    type GenerativeModel,
    SchemaType,
} from "@google/generative-ai";
import dayjs from "dayjs";
import type { AIService, Transaction } from "../types/types";

class GeminiService implements AIService {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
        });
    }

    async parseTransaction(
        input: { text?: string; imageUrl?: string },
        accountNames: string[],
        categoryNames: string[],
    ): Promise<Transaction | null> {
        try {
            const chatSession = this.model.startChat({
                generationConfig: this.getGenerationConfig(),
                history: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `Extract transaction details from user input. default date is today ${dayjs().format("YYYY-MM-DD")}. with the following Account Name: ${accountNames}, Category Name: ${categoryNames}. using negative amount for expense and positive amount for income.`,
                            },
                        ],
                    },
                ],
            });

            const messageParts = [];

            const { imageUrl, text } = input;
            if (imageUrl) {
                const imageResponse = await fetch(imageUrl);
                const imageData = await imageResponse.arrayBuffer();
                messageParts.push({
                    inlineData: {
                        data: Buffer.from(imageData).toString('base64'),
                        mimeType: "image/jpeg"
                    }
                });
            }

            if (text) {
                messageParts.push({ text });
            }

            const result = await chatSession.sendMessage(messageParts);
            return JSON.parse(result.response.text()) as Transaction;
        } catch (error) {
            console.error("Error parsing transaction:", error);
            return null;
        }
    }

    private getGenerationConfig(): GenerationConfig {
        return {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    account: {
                        type: SchemaType.STRING,
                    },
                    date: {
                        type: SchemaType.STRING,
                    },
                    amount: {
                        type: SchemaType.NUMBER,
                    },
                    payee_name: {
                        type: SchemaType.STRING,
                    },
                    category: {
                        type: SchemaType.STRING,
                    },
                    notes: {
                        type: SchemaType.STRING,
                    },
                },
                required: ["account", "date", "amount"],
            },
        };
    }
}

export default GeminiService;
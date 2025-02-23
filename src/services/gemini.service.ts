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
		input: { text: string },
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
								text: `Parse the following transaction info into a valid transaction. Default date is today ${dayjs().format("YYYY-MM-DD")}. Available accounts: ${accountNames.join(", ")}. Available categories: ${categoryNames.join(", ")}. Use negative amount for expense and positive for income. Input: ${input.text}`,
							},
						],
					},
				],
			});

			const messageParts = [];
			messageParts.push({ text: input.text });

			const result = await chatSession.sendMessage(messageParts);
			console.log("Gemini raw response:", result.response.text());

			const parsedResult = JSON.parse(result.response.text());
			// Handle both array and single object responses
			const parsedTransaction = Array.isArray(parsedResult)
				? parsedResult[0]
				: parsedResult;

			console.log("Raw Gemini response:", result.response.text());
			console.log("Parsed transaction:", parsedTransaction);

			// Validate and format the date
			let transactionDate = dayjs().format("YYYY-MM-DD"); // Default to today
			if (parsedTransaction.date) {
				const parsedDate = dayjs(parsedTransaction.date);
				if (parsedDate.isValid()) {
					transactionDate = parsedDate.format("YYYY-MM-DD");
				}
			}

			if (!parsedTransaction || typeof parsedTransaction !== "object") {
				console.error("Invalid transaction format received from Gemini");
				return null;
			}

			return {
				...parsedTransaction,
				date: transactionDate,
			} as Transaction;
		} catch (error) {
			console.error("Gemini error in parseTransaction:", error);
			return null;
		}
	}

	async parseTransactionFromImage(
		input: { imageUrl: string; text?: string },
		accountNames: string[],
		categoryNames: string[],
	): Promise<string | null> {
		try {
			const imageResponse = await fetch(input.imageUrl);
			const imageData = await imageResponse.arrayBuffer();
			const base64ImageData = Buffer.from(imageData).toString("base64");

			const parts = [
				{
					inlineData: {
						data: base64ImageData,
						mimeType: "image/jpeg",
					},
				},
				{
					text: `Extract transaction details from the image and consider this additional context: "${input.text || ""}". Describe the transaction in this format: "Transfer of [amount] from [account] to [payee] on [date] for [notes]. Category: [category]" and you can have more field if it have in a image. Use negative amount for expense and positive for income. Available accounts: ${accountNames.join(", ")}. Available categories: ${categoryNames.join(", ")}.`,
				},
			];

			const result = await this.model.generateContent({
				contents: [{ role: "user", parts }],
				generationConfig: {
					temperature: 1,
					topP: 0.95,
					topK: 40,
					maxOutputTokens: 8192,
					responseMimeType: "application/json",
				},
			});
			console.log(
				"Gemini raw image extraction response:",
				result.response.text(),
			);

			// Return the raw text description from Gemini
			const extractedInfo = result.response.text();
			if (!extractedInfo) {
				console.error("No transaction info extracted from image");
				return null;
			}

			return extractedInfo;
		} catch (error) {
			console.error("Gemini error in parseTransactionFromImage:", error);
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

import { Telegraf, type Context } from "telegraf";
import api from "@actual-app/api";
import {
	GoogleGenerativeAI,
	type GenerationConfig,
	type GenerativeModel,
} from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai/server";
import dayjs from "dayjs";
import type { APIAccountEntity } from "@actual-app/api/@types/loot-core/server/api-models";

process.loadEnvFile("./.env");

class Config {
	readonly BOT_TOKEN: string;
	readonly OPENAI_API_KEY: string;
	readonly ACTUAL_API_URL: string;
	readonly ACTUAL_API_TOKEN: string;
	readonly ACTUAL_BUDGET_ID: string;
	readonly GEMINI_API_KEY: string;

	constructor() {
		this.BOT_TOKEN = process.env.BOT_TOKEN ?? "";
		this.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
		this.ACTUAL_API_URL = process.env.ACTUAL_API_URL ?? "";
		this.ACTUAL_API_TOKEN = process.env.ACTUAL_API_TOKEN ?? "";
		this.ACTUAL_BUDGET_ID = process.env.ACTUAL_BUDGET_ID ?? "";
		this.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
	}
}

type Transaction = {
	account: string;
	date: string;
	amount: number;
	payee_name?: string;
	category?: string;
	notes?: string;
};

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
		text: string,
		accountNames: string[],
		categoryNames: string[],
	): Promise<Transaction | null> {
		const generationConfig: GenerationConfig = {
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
		const chatSession = this.model.startChat({
			generationConfig,
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

		const result = await chatSession.sendMessage(text);
		const transaction: Transaction = JSON.parse(
			result.response.text(),
		) as Transaction;

		return transaction;
	}
}

class ActualBudgetService {
	private config: Config;
	private apiInstance: typeof api;
	private apiInitialized = false;

	constructor(config: Config) {
		this.config = config;
		this.apiInstance = api;
	}

	async init(): Promise<void> {
		if (this.apiInitialized) {
			return;
		}
		await this.apiInstance.init({
			dataDir: "./.cache",
			serverURL: this.config.ACTUAL_API_URL,
			password: this.config.ACTUAL_API_TOKEN,
		});

		await this.apiInstance.downloadBudget(this.config.ACTUAL_BUDGET_ID, {
			password: this.config.ACTUAL_API_TOKEN,
		});

		this.apiInitialized = true;
		console.log("API initialized successfully");
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.apiInitialized) {
			await this.init();
		}
	}

	async getAccounts() {
		try {
			await this.ensureInitialized();
			return this.apiInstance.getAccounts();
		} catch (error) {
			console.error("Error getting accounts:", error);
			throw error;
		}
	}

	async getCategories() {
		try {
			await this.ensureInitialized();
			return this.apiInstance.getCategories();
		} catch (error) {
			console.error("Error getting categories:", error);
			throw error;
		}
	}

	async addTransaction(
		accountId: string,
		transaction: Transaction[],
	): Promise<"ok"> {
		try {
			await this.ensureInitialized();
			return await this.apiInstance.addTransactions(accountId, transaction);
		} catch (error) {
			console.error("Error adding transaction:", error);
			throw error;
		}
	}
}

interface AIService {
	parseTransaction(
		text: string,
		accountNames: string[],
		categoryNames: string[],
	): Promise<Transaction | null>;
}

class TelegramBot {
	private bot: Telegraf<Context>;

	constructor(botToken: string) {
		this.bot = new Telegraf(botToken);
	}

	commandTransaction(callback: (ctx: Context) => void) {
		this.bot.command("trx", callback);
	}

	currentBot() {
		return this.bot;
	}

	launch() {
		this.bot.launch();
		process.once("SIGINT", () => this.bot.stop("SIGINT"));
		process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
	}
}

class Main {
	private config: Config;
	private telegramBotService: TelegramBot;
	private actualBudgetService: ActualBudgetService;
	private aiService: AIService;
	constructor() {
		this.config = new Config();
		this.actualBudgetService = new ActualBudgetService(this.config);
		// const openAIService = new OpenAIService(devConfig.OPENAI_API_KEY);
		this.aiService = new GeminiService(this.config.GEMINI_API_KEY);
		this.telegramBotService = new TelegramBot(this.config.BOT_TOKEN);
	}
	async runner() {
		const accounts = await this.actualBudgetService.getAccounts();
		console.log("Accounts:", accounts);
		const categories = await this.actualBudgetService.getCategories();
		// console.log("Categories:", categories);

		this.telegramBotService.commandTransaction(async (ctx) => {
			const userInput = ctx.text ?? "";

			console.log("User input:", ctx.update);

			const accountNames: string[] = accounts.map((account) => account.name);
			const categoryNames: string[] = categories.map(
				(category) => category.name,
			);
			const transaction = await this.aiService.parseTransaction(
				userInput,
				accountNames,
				categoryNames,
			);

			if (!transaction) {
				return ctx.reply(
					"Sorry, I could not understand the transaction details.",
				);
			}

			try {
				console.log("Transaction:", transaction);
				const accountMap = new Map(
					accounts.map((account) => [account.name, account.id]),
				);
				const categoryMap = new Map(
					categories.map((category) => [category.name, category.id]),
				);

				const updatedTransactionToId: Transaction = {
					...transaction,
					amount: transaction.amount * 100,
					account: accountMap.get(transaction.account) || transaction.account,
					category:
						categoryMap.get(transaction.category ?? "") || transaction.category,
				};

				await this.actualBudgetService.addTransaction(
					updatedTransactionToId.account,
					[updatedTransactionToId],
				);
				ctx.reply(
					`Transaction details: ${JSON.stringify(updatedTransactionToId, null, 2)}`,
				);
				ctx.reply("Transaction added successfully!");
			} catch (error) {
				ctx.reply("Failed to add transaction. Please try again.");
			}
		});

		this.telegramBotService.launch();
	}
}

(async () => {
	const main = new Main();
	await main.runner();
})();

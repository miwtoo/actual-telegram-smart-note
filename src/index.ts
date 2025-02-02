import { Telegraf, type Context } from "telegraf";
import OpenAI from "openai";
import api from "@actual-app/api";
process.loadEnvFile("./.env");

class Config {
	readonly BOT_TOKEN: string;
	readonly OPENAI_API_KEY: string;
	readonly ACTUAL_API_URL: string;
	readonly ACTUAL_API_TOKEN: string;
	readonly ACTUAL_BUDGET_ID: string;
	readonly ACTUAL_ACCOUNT_ID: string;

	constructor() {
		this.BOT_TOKEN = process.env.BOT_TOKEN ?? "";
		this.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
		this.ACTUAL_API_URL = process.env.ACTUAL_API_URL ?? "";
		this.ACTUAL_API_TOKEN = process.env.ACTUAL_API_TOKEN ?? "";
		this.ACTUAL_BUDGET_ID = process.env.ACTUAL_BUDGET_ID ?? "";
		this.ACTUAL_ACCOUNT_ID = process.env.ACTUAL_ACCOUNT_ID ?? "";
	}
}

interface Transaction {
	account: string;
	date: string;
	amount: number;
	payee_name?: string;
	category?: string;
	notes?: string;
}

class OpenAIService {
	private openai: OpenAI;

	constructor(apiKey: string) {
		this.openai = new OpenAI({ apiKey });
	}

	async parseTransaction(text: string): Promise<Transaction | null> {
		try {
			const response = await this.openai.completions.create({
				model: "gpt-4o-mini",
				prompt: `Extract transaction details from this sentence: "${text}"\nFormat as JSON with fields: account, date, amount, payee_name, category, notes.`,
				max_tokens: 100,
			});

			return JSON.parse(response.choices[0].text.trim());
		} catch (error) {
			console.error("Error processing OpenAI request:", error);
			return null;
		}
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
	  this.apiInitialized = true;
	  console.log("API initialized successfully");
	}
  
	private async ensureInitialized(): Promise<void> {
	  if (!this.apiInitialized) {
		await this.init();
	  }
	}
  
	async downloadBudget(): Promise<void> {
	  console.log("Downloading budget...");
	  await this.ensureInitialized();
	  await this.apiInstance.downloadBudget(this.config.ACTUAL_BUDGET_ID, {
		password: this.config.ACTUAL_API_TOKEN,
	  });
	  console.log("Budget downloaded successfully");
	}
  
	async addTransaction(transaction: Transaction): Promise<"ok"> {
	  try {
		await this.ensureInitialized();
		return await this.apiInstance.addTransactions(this.config.ACTUAL_ACCOUNT_ID, [
		  { ...transaction, amount: transaction.amount * 100 },
		]);
	  } catch (error) {
		console.error("Error adding transaction:", error);
		throw error;
	  }
	}
  
	async getBudgetMonth(month: string): Promise<{
	  month: string;
	  incomeAvailable: number;
	  lastMonthOverspent: number;
	  forNextMonth: number;
	  totalBudgeted: number;
	  toBudget: number;
	  fromLastMonth: number;
	  totalIncome: number;
	  totalSpent: number;
	  totalBalance: number;
	  categoryGroups: Record<string, unknown>[];
	}> {
	  try {
		await this.ensureInitialized();
		return await this.apiInstance.getBudgetMonth(month);
	  } catch (error) {
		console.error("Error getting budget month:", error);
		throw error;
	  }
	}
  }

class TelegramBot {
	private bot: Telegraf<Context>;
	private openAIService: OpenAIService;
	private actualBudgetService: ActualBudgetService;

	constructor(
		botToken: string,
		openAIService: OpenAIService,
		actualBudgetService: ActualBudgetService,
	) {
		this.bot = new Telegraf(botToken);
		this.openAIService = openAIService;
		this.actualBudgetService = actualBudgetService;
	}

	async setupHandlers() {
		this.bot.on("text", async (ctx) => {
			const userInput = ctx.message.text;
			const transaction = await this.openAIService.parseTransaction(userInput);

			if (!transaction) {
				return ctx.reply(
					"Sorry, I could not understand the transaction details.",
				);
			}

			const result = await this.actualBudgetService.addTransaction(transaction);
			ctx.reply(
				result
					? "Transaction added successfully!"
					: "Failed to add transaction.",
			);
		});
	}

	launch() {
		this.bot.launch();
		process.once("SIGINT", () => this.bot.stop("SIGINT"));
		process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
	}
}

const devConfig = new Config();
const actualBudgetService = new ActualBudgetService(devConfig);
const openAIService = new OpenAIService(devConfig.OPENAI_API_KEY);
const bot = new TelegramBot(
	devConfig.BOT_TOKEN,
	openAIService,
	actualBudgetService,
);

async function main() {
	await actualBudgetService.downloadBudget();
	const budget = await actualBudgetService.getBudgetMonth("2025-02");
	console.log(budget);

	await bot.setupHandlers();

	bot.launch();
}

main().catch(console.error);

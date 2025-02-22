import Config from "./config/config.ts";
import TelegramBot from "./services/telegram.bot.ts";
import ActualBudgetService from "./services/actual-budget.service.ts";
import GeminiService from "./services/gemini.service.ts";
import type { Context } from "telegraf";

class Main {
	private config: Config;
	private telegramBotService: TelegramBot;
	private actualBudgetService: ActualBudgetService;
	private aiService: GeminiService;
	constructor() {
		this.config = new Config();
		this.actualBudgetService = new ActualBudgetService(this.config);
		this.aiService = new GeminiService(this.config.GEMINI_API_KEY);
		this.telegramBotService = new TelegramBot(this.config.BOT_TOKEN);
	}
	async runner() {
		const accounts = await this.actualBudgetService.getAccounts();
		console.log("Accounts:", accounts);
		const categories = await this.actualBudgetService.getCategories();

		this.telegramBotService.commandTransaction(async (ctx: Context) => {
			const input = { text: "", imageUrl: "" };

			if ("message" in ctx.update && "photo" in ctx.update.message) {
				const message = ctx.update.message;
				const photos = message.photo;

				if (photos && photos.length > 0) {
					const fileId = photos[photos.length - 1].file_id;
					const file = await ctx.telegram.getFile(fileId);
					input.imageUrl = `https://api.telegram.org/file/bot${this.config.BOT_TOKEN}/${file.file_path}`;
					input.text = message.caption || "";
				}
			} else {
				input.text = ctx.text || "";
			}

			console.log("User input:", ctx.update);

			const accountNames: string[] = accounts.map((account) => account.name);
			const categoryNames: string[] = categories.map(
				(category) => category.name,
			);
			const transaction = await this.aiService.parseTransaction(
				input,
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

				const updatedTransactionToId = {
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

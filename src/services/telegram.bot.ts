import { Telegraf, type Context } from "telegraf";

class TelegramBot {
    private bot: Telegraf<Context>;

    constructor(botToken: string) {
        this.bot = new Telegraf(botToken);
    }

    commandTransaction(callback: (ctx: Context) => void) {
        this.bot.command("trx", callback);
        this.bot.on("photo", callback);
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

export default TelegramBot;
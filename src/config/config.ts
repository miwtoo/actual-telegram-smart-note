import * as dotenv from 'dotenv';

dotenv.config({ path: './.env' });

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

export default Config;
import api from "@actual-app/api";
import type Config from "../config/config";
import type { Transaction } from "../types/types";
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

export default ActualBudgetService;
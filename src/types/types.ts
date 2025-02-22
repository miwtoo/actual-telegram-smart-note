export type Transaction = {
    account: string;
    date: string;
    amount: number;
    payee_name?: string;
    category?: string;
    notes?: string;
};

export interface AIService {
    parseTransaction(
        input: { text?: string; imageUrl?: string },
        accountNames: string[],
        categoryNames: string[],
    ): Promise<Transaction | null>;
}
export interface WalletData {
    walletAddress: string;
    timestamp: string;
    status: number | 'failed';
    data?: any;
    error?: string;
    retryCount?: number;
}

export interface WalletDataCollection {
    timestamp: string;
    wallets: WalletData[];
}
